/**
 * 비즈파일럿 피드 가져오기 (10/25): https://bizpilot.kr/nobangjang/feed.json (BIZPILOT_FEED_URL 로 바꿀 수 있음)을 10분마다 읽어
 * 아직 안 올라간 칸을 shop_queue 에 넣거나 고친다. 올리는 건 publishDue (시각이 된 칸, 하루 넘게 늦은 칸은 건너뜀).
 * 피드가 안 열리거나 모양이 틀려도 서버는 그대로 — shop_feed_state 에 남기고 다음 차례에 다시.
 */
import { query } from "../db";
import { DEFAULT_FEED_URL, FEED_EVERY_MS, SHOP_AUTHOR, feedItems, feedSchema } from "../shopRoom";
import { upsertQueueItem } from "./shopQueue";

const MAX_FEED_BYTES = 2 * 1024 * 1024;

export const feedUrl = () => process.env.BIZPILOT_FEED_URL || DEFAULT_FEED_URL;

export type FeedState = {
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string;
  posts: number;
  pinned: number;
  queued: number;
};

export async function feedState(): Promise<FeedState | null> {
  const [r] = await query<FeedState>("SELECT last_run_at, last_ok_at, last_error, posts, pinned, queued FROM shop_feed_state WHERE id = 1");
  return r ?? null;
}

export type FeedFetcher = (url: string) => Promise<unknown>;

const defaultFetcher: FeedFetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json", "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`피드 응답 ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw new Error("피드가 너무 커요");
  return JSON.parse(text);
};

type Row = { key: string; head: string; title: string; body: string; publish_at: string; image_urls: string[]; pinned: boolean; published_at: string | null; nickname: string };

/** 피드 한 번 읽기. force 가 아니면 10분에 한 번만 (서버가 다시 떠도 DB 기록 기준) */
export async function syncFeed(now = new Date(), opts: { force?: boolean; fetcher?: FeedFetcher } = {}): Promise<{ ran: boolean; queued: string[]; errors: string[] } > {
  const claimed = await query(
    `UPDATE shop_feed_state SET last_run_at = $1::timestamptz
      WHERE id = 1 AND ($2 OR last_run_at IS NULL OR last_run_at <= $1::timestamptz - make_interval(secs => $3)) RETURNING id`,
    [now.toISOString(), !!opts.force, FEED_EVERY_MS / 1000 - 5],
  );
  if (!claimed.length) return { ran: false, queued: [], errors: [] };
  const errors: string[] = [];
  const queued: string[] = [];
  let raw: unknown;
  try {
    raw = await (opts.fetcher ?? defaultFetcher)(feedUrl());
  } catch (err) {
    const msg = `피드를 읽지 못했어요: ${(err as Error).message ?? err}`;
    await query("UPDATE shop_feed_state SET last_error = $1 WHERE id = 1", [msg.slice(0, 1000)]);
    return { ran: true, queued, errors: [msg] };
  }
  const parsed = feedSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = `피드 모양이 달라요: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
    await query("UPDATE shop_feed_state SET last_error = $1 WHERE id = 1", [msg.slice(0, 1000)]);
    return { ran: true, queued, errors: [msg] };
  }
  const feed = parsed.data;
  const nickname = feed.nickname || SHOP_AUTHOR;
  const { items, problems } = feedItems(feed, now);
  errors.push(...problems);
  const keys = items.map((i) => i.key);
  const rows = await query<Row>(
    "SELECT key, head, title, body, publish_at, image_urls, pinned, published_at, nickname FROM shop_queue WHERE key = ANY($1::text[])",
    [keys],
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));
  for (const it of items) {
    const cur = byKey.get(it.key);
    if (cur?.published_at && !it.pinned) continue; // 올린 id 는 다시 올리지 않는다
    const same =
      cur &&
      cur.head === it.head &&
      cur.title === it.title &&
      cur.body === it.body &&
      cur.pinned === it.pinned &&
      cur.nickname === nickname &&
      (it.pinned || new Date(cur.publish_at).getTime() === it.publishAt.getTime()) &&
      cur.image_urls.length === it.imageUrls.length &&
      cur.image_urls.every((u, i) => u === it.imageUrls[i]);
    if (same) continue;
    try {
      // 고정 글은 처음 넣을 때만 "지금", 고칠 때는 원래 시각 그대로
      const publishAt = it.pinned && cur ? new Date(cur.publish_at) : it.publishAt;
      await upsertQueueItem({ ...it, publishAt, nickname });
      queued.push(it.key);
    } catch (err) {
      errors.push(`${it.key}: ${(err as Error).message ?? err}`);
    }
  }
  await query(
    `UPDATE shop_feed_state SET last_ok_at = $1::timestamptz, last_error = $2, posts = $3, pinned = $4, queued = $5 WHERE id = 1`,
    [now.toISOString(), errors.join("\n").slice(0, 1000), feed.posts.length, feed.pinned.length, queued.length],
  );
  return { ran: true, queued, errors };
}
