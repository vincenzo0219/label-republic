/**
 * 🏪 오늘도 장사중 글 대기열 (shop_queue, 10/25). 비즈파일럿 피드(src/lib/repo/shopFeed.ts)·운영(POST /api/admin/shop-queue)이 넣고
 * 서버 작업이 정해진 시각에 올린다. 칸 key 는 피드 id ("2026-10-26-0830") — 같은 글이 두 번 올라가지 않는다.
 * 그림(🖼 오늘의 카드)은 넣을 때 bizpilot.kr 에서 받아 사이트 이미지 저장소에 미리 저장한다 — 올린 글이 남의 주소를 끌어 쓰지 않게.
 */
import { createHmac } from "node:crypto";
import { config } from "../config";
import { query } from "../db";
import { HttpError } from "../errors";
import { imageToken, saveUpload, deleteFiles } from "./images";
import { createPost } from "./posts";
import { claimNickname } from "./nicknames";
import {
  LATE_LIMIT_HOURS, NOTICE_SEED, PIN_ALL, SHOP_AUTHOR, SHOP_ROOM, addDays, isShopHead, kstDate, noticeDay, noticeText, roundupSunday, weekSeed, weekText,
  type QueueLine,
} from "../shopRoom";

/** 그림은 비즈파일럿 주소에서만 받는다 (서버가 아무 주소나 대신 받아 오지 않게) */
export const IMAGE_HOSTS = new Set(["bizpilot.kr", "www.bizpilot.kr"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type QueueInput = {
  key: string;
  publishAt: Date;
  head: string;
  title: string;
  body: string;
  imageUrls: string[];
  pinned: boolean;
  /** 비즈파일럿 닉네임 비밀번호. 비우면 서버 값 (serverPin) */
  pin?: string;
  nickname?: string;
};

/** 서버가 비즈파일럿 이름으로 올릴 때 쓰는 비밀번호: BIZPILOT_PIN, 없으면 서버 비밀값에서 만든 4자리 (사람에게 보이지 않음) */
export function serverPin(): string {
  const env = process.env.BIZPILOT_PIN;
  if (env && /^\d{4}$/.test(env)) return env;
  const n = createHmac("sha256", config.appSecret).update("bizpilot-author-pin").digest().readUInt32BE(0) % 10000;
  return String(n).padStart(4, "0");
}

export type QueueRow = {
  key: string;
  room_slug: string;
  publish_at: string;
  head: string;
  title: string;
  body: string;
  image_urls: string[];
  image_ids: string[];
  pinned: boolean;
  nickname: string;
  pin: string;
  post_id: string | null;
  published_at: string | null;
  last_error: string;
};

export function assertImageUrl(u: string): URL {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new HttpError(400, "invalid_image", `그림 주소가 올바르지 않아요: ${u}`);
  }
  if (url.protocol !== "https:" || !IMAGE_HOSTS.has(url.hostname)) throw new HttpError(400, "invalid_image", `그림은 https://bizpilot.kr 주소만 받아요: ${u}`);
  return url;
}

async function fetchImage(u: string): Promise<Buffer> {
  const url = assertImageUrl(u);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": `nobangjang (+${config.siteUrl})` } });
  // 넘겨주기(redirect)가 있어도 마지막 주소가 비즈파일럿이어야 한다
  if (res.url) assertImageUrl(res.url);
  if (!res.ok) throw new HttpError(502, "image_fetch", `그림을 받지 못했어요 (${res.status}): ${u}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_IMAGE_BYTES) throw new HttpError(413, "image_too_large", `그림이 너무 커요: ${u}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(413, "image_too_large", `그림이 너무 커요: ${u}`);
  return buf;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * 넣기·고치기 (key 로 덮어씀). 이미 올라간 칸은 고정 글만 글 내용을 고치고, 나머지는 그대로 둔다.
 * 그림 주소가 바뀌었을 때만 다시 받는다.
 */
export async function upsertQueueItem(input: QueueInput): Promise<{ key: string; status: "queued" | "updated_post" | "already_published"; postId: string | null; images: number }> {
  if (!isShopHead(input.head)) throw new HttpError(400, "invalid_head", `탭이 올바르지 않아요: ${input.head}`);
  const pin = input.pin ?? serverPin();
  const nickname = input.nickname ?? SHOP_AUTHOR;
  if (!/^\d{4}$/.test(pin)) throw new HttpError(400, "invalid_input", "비밀번호(4자리)가 필요해요.");
  // 작성자 닉네임은 한 사람만 — 처음이면 이 비밀번호로 등록되고, 이미 있으면 비밀번호가 맞아야 한다
  await claimNickname(nickname, pin);
  input.imageUrls.forEach(assertImageUrl);
  const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [SHOP_ROOM]);
  if (!cat) throw new HttpError(400, "invalid_category", "방이 아직 없어요.");
  const [cur] = await query<QueueRow>("SELECT * FROM shop_queue WHERE key = $1", [input.key]);
  if (cur?.published_at) {
    if (!cur.pinned || !cur.post_id) return { key: input.key, status: "already_published", postId: cur.post_id, images: cur.image_ids.length };
    await query("UPDATE posts SET title = $2, body = $3, updated_at = now() WHERE id = $1 AND (title <> $2 OR body <> $3)", [cur.post_id, input.title, input.body]);
    await query("UPDATE shop_queue SET title = $2, body = $3, updated_at = now() WHERE key = $1", [input.key, input.title, input.body]);
    return { key: input.key, status: "updated_post", postId: cur.post_id, images: cur.image_ids.length };
  }
  let imageIds = cur?.image_ids ?? [];
  if (!cur || !sameList(cur.image_urls, input.imageUrls) || imageIds.length !== input.imageUrls.length) {
    const fresh: string[] = [];
    try {
      for (const u of input.imageUrls) fresh.push((await saveUpload(await fetchImage(u), null)).id);
    } catch (err) {
      await deleteFiles(fresh).catch(() => {});
      await query("DELETE FROM post_images WHERE id = ANY($1::uuid[]) AND post_id IS NULL", [fresh]).catch(() => {});
      throw err;
    }
    const old = imageIds;
    imageIds = fresh;
    if (old.length) {
      await query("DELETE FROM post_images WHERE id = ANY($1::uuid[]) AND post_id IS NULL", [old]);
      await deleteFiles(old).catch(() => {});
    }
  }
  await query(
    `INSERT INTO shop_queue (key, room_slug, publish_at, head, title, body, image_urls, image_ids, pinned, nickname, pin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9, $10, $11)
     ON CONFLICT (key) DO UPDATE SET publish_at = EXCLUDED.publish_at, head = EXCLUDED.head, title = EXCLUDED.title, body = EXCLUDED.body,
       image_urls = EXCLUDED.image_urls, image_ids = EXCLUDED.image_ids, pinned = EXCLUDED.pinned, nickname = EXCLUDED.nickname, pin = EXCLUDED.pin,
       last_error = '', updated_at = now()`,
    [input.key, SHOP_ROOM, input.publishAt.toISOString(), input.head, input.title, input.body, input.imageUrls, imageIds, input.pinned, nickname, pin],
  );
  return { key: input.key, status: "queued", postId: null, images: imageIds.length };
}

export async function listQueue(): Promise<Omit<QueueRow, "pin" | "body">[]> {
  return query(
    `SELECT key, room_slug, publish_at, head, ${TITLE} AS title, image_urls, image_ids, pinned, nickname, post_id::text, published_at, last_error
       FROM shop_queue q WHERE published_at IS NULL OR published_at > now() - interval '8 days' ORDER BY publish_at, key`,
  );
}

/** 아직 안 올라간 칸 지우기 (받아 둔 그림도) */
export async function deleteQueueItem(key: string): Promise<boolean> {
  const rows = await query<{ image_ids: string[] }>("DELETE FROM shop_queue WHERE key = $1 AND published_at IS NULL RETURNING image_ids", [key]);
  const ids = rows[0]?.image_ids ?? [];
  if (ids.length) {
    await query("DELETE FROM post_images WHERE id = ANY($1::uuid[]) AND post_id IS NULL", [ids]);
    await deleteFiles(ids).catch(() => {});
  }
  return rows.length > 0;
}

export { LATE_LIMIT_HOURS };

/** 질문형 제목을 단정문으로: 칸 key → 제목 (피드가 제목을 다시 보내도 이것이 이긴다) */
export async function setTitleOverrides(titles: Record<string, string>): Promise<number> {
  let n = 0;
  for (const [key, title] of Object.entries(titles)) {
    if (title.trim()) await query(
      `INSERT INTO shop_title_overrides (key, title) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, updated_at = now()`,
      [key, title.trim().slice(0, 120)],
    );
    else await query("DELETE FROM shop_title_overrides WHERE key = $1", [key]);
    n++;
  }
  return n;
}

const TITLE = "coalesce((SELECT o.title FROM shop_title_overrides o WHERE o.key = q.key), q.title)";

/** 때가 된 칸 하나를 잡아 올린다. 두 서버가 동시에 돌아도 한 번만 (claimed_at) */
async function publishOne(key: string): Promise<string | null> {
  const [row] = await query<QueueRow>(
    `UPDATE shop_queue q SET claimed_at = now()
      WHERE key = $1 AND published_at IS NULL AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
      RETURNING q.*, ${TITLE} AS title`,
    [key],
  );
  if (!row) return null;
  try {
    const n = row.image_ids.length;
    const post = await createPost({
      categorySlug: row.room_slug,
      nickname: row.nickname,
      pin: row.pin,
      title: row.title,
      body: row.body,
      summary: null,
      noSummary: true,
      postType: "info",
      images: row.image_ids.map((id, i) => ({ id, token: imageToken(id), alt: n > 1 ? `${row.title} (${i + 1}/${n})` : row.title })),
    });
    if (row.pinned) {
      // 같은 탭의 예전 고정 글은 내린다 (탭마다 하나)
      await query("UPDATE posts SET pinned_tab = NULL WHERE category_id = (SELECT category_id FROM posts WHERE id = $1) AND pinned_tab = $2 AND id <> $1", [post.id, row.head]);
      await query("UPDATE posts SET pinned_tab = $2 WHERE id = $1", [post.id, row.head]);
    }
    await query("UPDATE shop_queue SET published_at = now(), post_id = $2, last_error = '' WHERE key = $1", [key, post.id]);
    return post.id;
  } catch (err) {
    await query("UPDATE shop_queue SET claimed_at = NULL, last_error = $2 WHERE key = $1", [key, String((err as Error).message ?? err).slice(0, 500)]);
    throw err;
  }
}

export async function publishDue(now = new Date()): Promise<string[]> {
  const due = await query<{ key: string }>(
    `SELECT key FROM shop_queue WHERE published_at IS NULL AND publish_at <= $1::timestamptz
        AND publish_at > $1::timestamptz - make_interval(hours => $2) ORDER BY publish_at, key LIMIT 10`,
    [now.toISOString(), LATE_LIMIT_HOURS],
  );
  const out: string[] = [];
  for (const d of due) {
    const id = await publishOne(d.key);
    if (id) out.push(id);
  }
  return out;
}

const lines = (rows: { publish_at: string; head: string; title: string }[]): QueueLine[] =>
  rows.map((r) => ({ publishAt: new Date(r.publish_at), head: r.head, title: r.title }));

/** 방 전체 탭 맨 위 공지: 07:30 부터 그날 올라올 글 목록. 바뀐 게 없으면 손대지 않는다 */
export async function refreshNotice(now = new Date()): Promise<"updated" | "same" | "no_room"> {
  const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [SHOP_ROOM]);
  if (!cat) return "no_room";
  const day = noticeDay(now);
  const rows = await query<{ publish_at: string; head: string; title: string }>(
    `SELECT publish_at, head, ${TITLE} AS title FROM shop_queue q
      WHERE room_slug = $1 AND NOT pinned AND publish_at >= $2::timestamptz AND publish_at < $3::timestamptz
        AND (published_at IS NOT NULL OR publish_at > $4::timestamptz - make_interval(hours => ${LATE_LIMIT_HOURS}))`,
    [SHOP_ROOM, kstDate(day, "00:00").toISOString(), kstDate(addDays(day, 1), "00:00").toISOString(), now.toISOString()],
  );
  const { title, body } = noticeText(day, lines(rows));
  const r = await query<{ id: string }>(
    `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type, trust_tier, pinned_tab)
     VALUES ($1, $2, 'shop-notice', $3, $4, $5, 'shop-room', 'info', 'none', $6)
     ON CONFLICT (seed_key) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, pinned_tab = EXCLUDED.pinned_tab, updated_at = now()
      WHERE posts.title IS DISTINCT FROM EXCLUDED.title OR posts.body IS DISTINCT FROM EXCLUDED.body OR posts.pinned_tab IS DISTINCT FROM EXCLUDED.pinned_tab
     RETURNING id::text`,
    [cat.id, SHOP_AUTHOR, title, body, NOTICE_SEED, PIN_ALL],
  );
  return r.length ? "updated" : "same";
}

/** 일요일 22:30 글 뒤 "이번 주 모아 보기" 한 번 (그 주에 올린 글이 있을 때만) */
export async function postWeekRoundup(now = new Date()): Promise<string | null> {
  const sunday = roundupSunday(now);
  if (!sunday) return null;
  const from = kstDate(addDays(sunday, -6), "00:00").toISOString();
  const to = kstDate(addDays(sunday, 1), "00:00").toISOString();
  // 그 주 칸이 아직 다 올라가지 않았으면(22:30 글이 막 올라가는 중) 다음 차례에
  const [waiting] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM shop_queue WHERE room_slug = $1 AND published_at IS NULL AND publish_at >= $2::timestamptz AND publish_at <= $3::timestamptz
        AND publish_at > $3::timestamptz - make_interval(hours => $4)`,
    [SHOP_ROOM, from, now.toISOString(), LATE_LIMIT_HOURS],
  );
  if (waiting && waiting.n > 0) return null;
  const rows = await query<{ publish_at: string; head: string; title: string }>(
    `SELECT publish_at, head, ${TITLE} AS title FROM shop_queue q
      WHERE room_slug = $1 AND NOT pinned AND published_at IS NOT NULL AND publish_at >= $2::timestamptz AND publish_at < $3::timestamptz`,
    [SHOP_ROOM, from, to],
  );
  const text = weekText(sunday, lines(rows));
  if (!text) return null;
  const r = await query<{ id: string }>(
    `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type, trust_tier)
     SELECT id, $2, 'shop-week', $3, $4, $5, 'shop-room', 'info', 'none' FROM categories WHERE slug = $1
     ON CONFLICT (seed_key) DO NOTHING RETURNING id::text`,
    [SHOP_ROOM, SHOP_AUTHOR, text.title, text.body, weekSeed(sunday)],
  );
  return r[0]?.id ?? null;
}
