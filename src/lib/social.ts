/**
 * 스레드·인스타 게시 (Sprint 52). 승인 대기함에서 운영자가 [승인]을 눌렀을 때만 부른다.
 *
 * 토큰: 서버 환경 변수(THREADS_ACCESS_TOKEN, IG_ACCESS_TOKEN)의 장기 토큰으로 시작하고, 60일 만료 전에
 * 갱신한 새 토큰은 social_tokens 에 둔다. 운영자가 .env 의 토큰을 바꾸면(지문이 달라지면) 그걸 다시 쓴다.
 * 토큰이 들어간 주소·본문은 로그나 오류 메시지에 남기지 않는다.
 */
import { createHash } from "node:crypto";
import { config } from "./config";
import { query } from "./db";
import { HttpError } from "./errors";

export type Platform = "threads" | "instagram";
const LABEL: Record<Platform, string> = { threads: "스레드", instagram: "인스타" };
const GRAPH_VERSION = { threads: "v1.0", instagram: "v21.0" } as const;

function envToken(p: Platform) {
  return p === "threads" ? config.threadsAccessToken : config.instagramAccessToken;
}
function base(p: Platform) {
  return p === "threads" ? config.threadsApiBase : config.instagramApiBase;
}
const fingerprint = (t: string) => createHash("sha256").update(t).digest("hex");

/** 이 플랫폼에 자동으로 올릴 수 있나 (토큰이 설정돼 있나) */
export function socialReady(p: Platform): boolean {
  return Boolean(envToken(p));
}

async function token(p: Platform): Promise<string> {
  const env = envToken(p);
  if (!env) throw new HttpError(400, "social_not_configured", `${LABEL[p]} 토큰이 서버에 없어요. 직접 올린 뒤 [올렸음]을 눌러 주세요.`);
  const fp = fingerprint(env);
  const rows = await query<{ access_token: string; source_hash: string }>("SELECT access_token, source_hash FROM social_tokens WHERE platform = $1", [p]);
  if (rows[0]?.source_hash === fp) return rows[0].access_token;
  await query(
    `INSERT INTO social_tokens (platform, access_token, source_hash, refreshed_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (platform) DO UPDATE SET access_token = EXCLUDED.access_token, source_hash = EXCLUDED.source_hash, expires_at = NULL, refreshed_at = now()`,
    [p, env, fp],
  );
  return env;
}

type GraphResult = Record<string, unknown> & { id?: string };

async function call(p: Platform, method: "GET" | "POST", path: string, params: Record<string, string>, tok: string): Promise<GraphResult> {
  const qs = new URLSearchParams({ ...params, access_token: tok });
  const url = `${base(p)}${path}`;
  let res: Response;
  try {
    res = method === "GET" ? await fetch(`${url}?${qs}`, { signal: AbortSignal.timeout(20_000) }) : await fetch(url, { method, body: qs, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new HttpError(502, "social_failed", `${LABEL[p]}에 연결하지 못했어요 (${(err as Error).name}). 잠시 뒤 다시 눌러 주세요.`);
  }
  const body = (await res.json().catch(() => ({}))) as GraphResult & { error?: { message?: string; code?: number } };
  if (!res.ok || body.error) {
    const msg = String(body.error?.message ?? `HTTP ${res.status}`).replace(/access_token=[^&\s]+/g, "access_token=…").slice(0, 300);
    throw new HttpError(502, "social_failed", `${LABEL[p]} 게시 실패: ${msg}`);
  }
  return body;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 컨테이너를 만든 직후엔 아직 처리 중일 수 있어 몇 번 다시 시도한다 */
async function publish(p: Platform, creationId: string, tok: string): Promise<string> {
  const v = GRAPH_VERSION[p];
  const path = p === "threads" ? `/${v}/me/threads_publish` : `/${v}/me/media_publish`;
  let last: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await call(p, "POST", path, { creation_id: creationId }, tok);
      return String(r.id);
    } catch (err) {
      last = err;
      await sleep(socialRetryMs * (i + 1));
    }
  }
  throw last;
}

/** 테스트에서 기다림을 줄이려고 바꾼다 */
export let socialRetryMs = 2000;
export function setSocialRetryMs(ms: number) {
  socialRetryMs = ms;
}

async function permalink(p: Platform, id: string, tok: string): Promise<string> {
  try {
    const r = await call(p, "GET", `/${GRAPH_VERSION[p]}/${id}`, { fields: "permalink" }, tok);
    return typeof r.permalink === "string" ? r.permalink : "";
  } catch {
    return ""; // 올라간 건 확실하므로 주소만 못 가져온 건 실패로 치지 않는다
  }
}

/** 스레드에 글을 올리고, firstReply 가 있으면 그 글에 내 답글(링크 등)을 단다 */
export async function postToThreads(text: string, firstReply?: string): Promise<{ id: string; url: string }> {
  const tok = await token("threads");
  const v = GRAPH_VERSION.threads;
  const c = await call("threads", "POST", `/${v}/me/threads`, { media_type: "TEXT", text }, tok);
  const id = await publish("threads", String(c.id), tok);
  if (firstReply?.trim()) {
    const r = await call("threads", "POST", `/${v}/me/threads`, { media_type: "TEXT", text: firstReply.trim(), reply_to_id: id }, tok);
    await publish("threads", String(r.id), tok);
  }
  return { id, url: await permalink("threads", id, tok) };
}

/** 인스타 피드에 이미지 한 장 + 문구를 올린다. 이미지는 인터넷에서 열리는 https 주소여야 한다 */
export async function postToInstagram(imageUrl: string, caption: string): Promise<{ id: string; url: string }> {
  if (!/^https:\/\//.test(imageUrl)) throw new HttpError(400, "invalid_input", "인스타에는 공개된 https 이미지 주소가 필요해요.");
  const tok = await token("instagram");
  const v = GRAPH_VERSION.instagram;
  const c = await call("instagram", "POST", `/${v}/me/media`, { image_url: imageUrl, caption }, tok);
  const creation = String(c.id);
  for (let i = 0; i < 10; i++) {
    const s = await call("instagram", "GET", `/${v}/${creation}`, { fields: "status_code" }, tok);
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new HttpError(502, "social_failed", "인스타가 이미지를 처리하지 못했어요. 이미지 주소를 확인해 주세요.");
    await sleep(socialRetryMs);
  }
  const id = await publish("instagram", creation, tok);
  return { id, url: await permalink("instagram", id, tok) };
}

/**
 * 장기 토큰 갱신 — 7일에 한 번 (만료 60일). 정비 배치가 부른다. 실패해도 다른 작업은 계속한다.
 * 인스타 토큰은 발급 24시간 뒤부터 갱신할 수 있어 첫날은 건너뛴다.
 */
export async function refreshSocialTokens(now = new Date()): Promise<Platform[]> {
  const done: Platform[] = [];
  for (const p of ["threads", "instagram"] as Platform[]) {
    if (!socialReady(p)) continue;
    const tok = await token(p);
    const row = (await query<{ refreshed_at: Date }>("SELECT refreshed_at FROM social_tokens WHERE platform = $1", [p]))[0];
    if (row && now.getTime() - new Date(row.refreshed_at).getTime() < 7 * 24 * 3600_000) continue;
    try {
      const grant = p === "threads" ? "th_refresh_token" : "ig_refresh_token";
      const r = await call(p, "GET", "/refresh_access_token", { grant_type: grant }, tok);
      if (typeof r.access_token !== "string") continue;
      const expires = typeof r.expires_in === "number" ? new Date(now.getTime() + r.expires_in * 1000) : null;
      await query("UPDATE social_tokens SET access_token = $2, expires_at = $3, refreshed_at = $4 WHERE platform = $1", [p, r.access_token, expires, now]);
      done.push(p);
    } catch (err) {
      console.error(`[social] ${p} 토큰 갱신 실패:`, (err as Error).message);
    }
  }
  return done;
}
