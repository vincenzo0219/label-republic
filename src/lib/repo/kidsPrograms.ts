/**
 * 📍 동네 체험 (10/24, 육아방): 아이볼 파트너 API 프록시 + 캐시 + 프로그램마다 노방장 글(댓글용) + 🔔 접수 알림.
 * - 아이볼 호출은 3초 제한, 10분 단위 캐시(메모리). 받아 온 항목은 DB(kids_programs)에도 남겨 /kids/<id> 가 열리게
 * - 글은 첫 🔔 이나 첫 댓글에서야 만든다 (seed_key ibol:<id>, 방 전체·정보 목록에는 안 나옴)
 */
import { config } from "../config";
import { query } from "../db";
import { HttpError, notFound } from "../errors";
import {
  KIDS_ROOM,
  KIDS_SEED_PREFIX,
  isProgramId,
  isValidArea,
  normalizeResponse,
  programPostBody,
  programPostTitle,
  programStatus,
  type KidsProgram,
} from "../kidsPrograms";
import { subscriptionIdFor } from "./push";

export const KIDS_TIMEOUT_MS = 3000;
export const KIDS_BUCKET_MS = 10 * 60_000;
/** 아이볼이 잠깐 안 될 때 이만큼 지난 캐시까지는 그대로 보여 준다 */
const STALE_MS = 60 * 60_000;

export type KidsQuery = { area: string; age?: string; kind?: string; free?: boolean; soon?: number; limit?: number };

const KINDS = new Set(["체험", "축제", "공연"]);

/** 쿼리 검사: 지역은 목록에 있는 값만, 나머지는 정해진 모양만 (아이볼에 그대로 넘긴다) */
export function parseKidsQuery(sp: URLSearchParams): KidsQuery {
  const area = sp.get("area")?.trim() ?? "";
  if (!isValidArea(area)) throw new HttpError(400, "invalid_area", "지역을 다시 골라 주세요");
  const age = sp.get("age")?.trim() || undefined;
  if (age && !/^(?:\d{1,2}세|초[1-6]|중[1-3]|[0-9]{1,2}개월)$/.test(age)) throw new HttpError(400, "invalid_age", "연령을 다시 골라 주세요");
  const kind = sp.get("kind")?.trim() || undefined;
  if (kind && !KINDS.has(kind)) throw new HttpError(400, "invalid_kind", "종류를 다시 골라 주세요");
  const soonRaw = sp.get("soon");
  const soon = soonRaw ? Number(soonRaw) : undefined;
  if (soon !== undefined && !(Number.isInteger(soon) && soon >= 1 && soon <= 30)) throw new HttpError(400, "invalid_soon", "기간을 다시 골라 주세요");
  const limitRaw = Number(sp.get("limit") ?? 20);
  const limit = Number.isInteger(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 20;
  return { area, age, kind, free: sp.get("free") === "1", soon, limit };
}

type Entry = { bucket: number; at: number; items: KidsProgram[] };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<KidsProgram[]>>();
const warned = new Set<string>();
const missing = new Map<string, number>();

/** 테스트용 */
export function resetKidsCache() {
  cache.clear();
  inflight.clear();
  warned.clear();
  missing.clear();
}

export function ibolQueryString(q: KidsQuery): string {
  const p = new URLSearchParams({ area: q.area });
  if (q.age) p.set("age", q.age);
  if (q.kind) p.set("kind", q.kind);
  if (q.free) p.set("free", "1");
  if (q.soon) p.set("soon", String(q.soon));
  if (q.limit) p.set("limit", String(q.limit));
  // "서울 마포구" 의 공백은 %20 으로 (값은 그대로)
  return p.toString().replace(/\+/g, "%20");
}

function warnShape(where: string, info: { unknownKeys: string[]; shapeOk: boolean; dropped: number }) {
  if (info.shapeOk && !info.dropped && !info.unknownKeys.length) return;
  const sig = `${where}|${info.shapeOk}|${info.unknownKeys.join(",")}|${info.dropped > 0}`;
  if (warned.has(sig)) return;
  if (warned.size > 200) warned.clear();
  warned.add(sig);
  console.warn(`[kids] ibol ${where}: ${info.shapeOk ? "" : "알 수 없는 응답 모양, "}모르는 필드 [${info.unknownKeys.join(", ")}], 버린 항목 ${info.dropped}`);
}

async function callIbol(qs: string, where: string): Promise<KidsProgram[]> {
  const res = await fetch(`${config.ibolApiBase}/api/partner/programs?${qs}`, {
    headers: { Accept: "application/json", "User-Agent": "nobangjang-partner/1" },
    signal: AbortSignal.timeout(KIDS_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ibol ${res.status}`);
  const r = normalizeResponse(await res.json());
  warnShape(where, r);
  if (!r.shapeOk) throw new Error("ibol shape");
  return r.items;
}

async function saveToDb(items: KidsProgram[]) {
  if (!items.length) return;
  await query(
    `INSERT INTO kids_programs (id, data, apply_start_at, fetched_at)
     SELECT x.id, x.data, (x.data->>'applyStartAt')::timestamptz, now() FROM jsonb_to_recordset($1::jsonb) AS x(id text, data jsonb)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, apply_start_at = EXCLUDED.apply_start_at, fetched_at = now()`,
    [JSON.stringify(items.map((p) => ({ id: p.id, data: p })))],
  ).catch((err) => console.warn("[kids] cache save failed:", (err as Error).message));
}

/** 프록시 본체: 10분 단위 캐시 → 아이볼(3초) → 실패하면 1시간 안의 캐시, 그것도 없으면 에러 */
export async function fetchPrograms(q: KidsQuery, now = Date.now()): Promise<KidsProgram[]> {
  const qs = ibolQueryString(q);
  const bucket = Math.floor(now / KIDS_BUCKET_MS);
  const hit = cache.get(qs);
  if (hit && hit.bucket === bucket) return hit.items;
  const running = inflight.get(qs);
  if (running) return running;
  const p = (async () => {
    try {
      const items = await callIbol(qs, "list");
      if (cache.size > 500) cache.clear();
      cache.set(qs, { bucket, at: now, items });
      await saveToDb(items);
      return items;
    } catch (err) {
      if (hit && now - hit.at < STALE_MS) return hit.items;
      console.warn("[kids] ibol fetch failed:", (err as Error).message);
      throw new HttpError(502, "kids_unavailable", "잠시 후 다시 볼 수 있어요");
    } finally {
      inflight.delete(qs);
    }
  })();
  inflight.set(qs, p);
  return p;
}

/** 프로그램 하나: DB 캐시 → (없으면) 아이볼에 id 로 물어본다. 모르면 null (10분 동안 다시 묻지 않음) */
export async function getProgram(id: string, now = Date.now()): Promise<KidsProgram | null> {
  if (!isProgramId(id)) return null;
  const [row] = await query<{ data: KidsProgram }>("SELECT data FROM kids_programs WHERE id = $1", [id]);
  if (row) return row.data;
  const miss = missing.get(id);
  if (miss && now - miss < KIDS_BUCKET_MS) return null;
  try {
    const items = await callIbol(new URLSearchParams({ id }).toString(), "lookup");
    const found = items.find((p) => p.id === id) ?? null;
    if (found) {
      await saveToDb([found]);
      return found;
    }
  } catch (err) {
    console.warn("[kids] ibol lookup failed:", (err as Error).message);
  }
  if (missing.size > 1000) missing.clear();
  missing.set(id, now);
  return null;
}

async function kidsCategoryId(): Promise<number> {
  const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [KIDS_ROOM]);
  if (!cat) throw notFound("육아방");
  return cat.id;
}

/** 프로그램 글 (없으면 null) */
export async function programPostId(id: string): Promise<string | null> {
  const [p] = await query<{ id: string }>("SELECT id::text FROM posts WHERE seed_key = $1 AND NOT is_blinded", [KIDS_SEED_PREFIX + id]);
  return p?.id ?? null;
}

/** 여러 프로그램의 댓글 수 (글이 있는 것만) */
export async function programCommentCounts(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const rows = await query<{ key: string; n: number }>(
    "SELECT seed_key AS key, comment_count AS n FROM posts WHERE seed_key = ANY($1::text[]) AND NOT is_blinded",
    [ids.map((id) => KIDS_SEED_PREFIX + id)],
  );
  return Object.fromEntries(rows.filter((r) => r.n > 0).map((r) => [r.key.slice(KIDS_SEED_PREFIX.length), r.n]));
}

/** 첫 🔔·첫 댓글에서 글을 만든다. 여러 번 불러도 글은 하나 */
export async function ensureProgramPost(p: KidsProgram): Promise<string> {
  const categoryId = await kidsCategoryId();
  await query(
    `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
     VALUES ($1, '노방장', 'ibol-program', $2, $3, $4, 'ibol', 'info')
     ON CONFLICT (seed_key) DO NOTHING`,
    [categoryId, programPostTitle(p), programPostBody(p), KIDS_SEED_PREFIX + p.id],
  );
  const id = await programPostId(p.id);
  if (!id) throw notFound("프로그램 글");
  return id;
}

/** 🔔 켜기/끄기. 접수 시작이 이미 지났으면 알림 대신 신청하기 */
export async function setProgramAlert(endpoint: string, token: string, programId: string, area: string, on: boolean, now = new Date()): Promise<{ on: boolean; postId: string | null }> {
  const subId = await subscriptionIdFor(endpoint, token);
  if (!on) {
    await query("DELETE FROM kids_program_alerts WHERE subscription_id = $1 AND program_id = $2", [subId, programId]);
    return { on: false, postId: await programPostId(programId) };
  }
  const p = await getProgram(programId);
  if (!p) throw notFound("프로그램");
  if (!p.applyStartAt || programStatus(p, now)?.key !== "soon") throw new HttpError(409, "already_open", "이미 접수가 열렸어요");
  const postId = await ensureProgramPost(p);
  const [{ n } = { n: 0 }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM kids_program_alerts WHERE subscription_id = $1", [subId]);
  if (n >= 100) throw new HttpError(429, "too_many_alerts", "알림은 100개까지예요");
  await query(
    `INSERT INTO kids_program_alerts (subscription_id, program_id, area, apply_start_at, program_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (subscription_id, program_id) DO UPDATE SET
       pre_sent_at = CASE WHEN kids_program_alerts.apply_start_at = EXCLUDED.apply_start_at THEN kids_program_alerts.pre_sent_at END,
       start_sent_at = CASE WHEN kids_program_alerts.apply_start_at = EXCLUDED.apply_start_at THEN kids_program_alerts.start_sent_at END,
       apply_start_at = EXCLUDED.apply_start_at, program_name = EXCLUDED.program_name, area = EXCLUDED.area`,
    [subId, p.id, area.slice(0, 40), p.applyStartAt, p.name.slice(0, 200)],
  );
  return { on: true, postId };
}
