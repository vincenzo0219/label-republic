/**
 * 푸시 구독 (Sprint 16). 알림을 켠 브라우저만 저장하고, 끄면 바로 지운다.
 * 구독을 고치거나 지우려면 등록할 때 돌려준 토큰(HMAC(비밀키, 주소))이 있어야 하고, 이미 있는 주소를 다시 등록할 때는
 * 암호화 키가 같거나 토큰이 있어야 한다 — 푸시 주소만 알아서는 남의 구독을 바꾸거나 토큰을 받아 갈 수 없다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "../db";
import { config } from "../config";
import { HttpError, notFound } from "../errors";
import { isAllowedEndpoint } from "../push";
import { MAX_MY_COMMENTS, MAX_WATCH_POSTS, MAX_WATCH_PRODUCTS } from "./watch";

export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string };
/** comments: 내 댓글 번호 (답글·멘션 알림, Sprint 30) */
export type WatchLists = { products: string[]; posts: string[]; comments?: string[] };

export function subscriptionToken(endpoint: string): string {
  return createHmac("sha256", config.appSecret).update(`push:${endpoint}`).digest("base64url");
}

function tokenOk(endpoint: string, token: string): boolean {
  const want = Buffer.from(subscriptionToken(endpoint));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

function checkToken(endpoint: string, token: string) {
  if (!tokenOk(endpoint, token)) throw new HttpError(403, "invalid_token", "알림 설정을 바꿀 권한이 없습니다.");
}

function lists(w: WatchLists) {
  const ids = (xs: string[], max: number) => [...new Set(xs.filter((x) => /^\d{1,18}$/.test(x)))].slice(0, max);
  return [ids(w.products, MAX_WATCH_PRODUCTS), ids(w.posts, MAX_WATCH_POSTS), ids(w.comments ?? [], MAX_MY_COMMENTS)] as const;
}

/**
 * 같은 푸시 주소가 이미 있으면, 같은 브라우저가 다시 켜는 경우(암호화 키가 같음)나 토큰을 가진 경우에만 덮어쓴다.
 * 주소만 알아낸 사람이 키를 바꿔 알림을 가로채거나 토큰을 받아 가지 못하게.
 */
export async function subscribe(sub: SubscriptionInput, watch: WatchLists, fp: string, token?: string, daily?: boolean): Promise<{ token: string }> {
  if (!config.pushEnabled) throw new HttpError(503, "push_disabled", "이 서버에서는 푸시 알림을 쓸 수 없습니다.");
  if (!isAllowedEndpoint(sub.endpoint)) throw new HttpError(400, "invalid_endpoint", "지원하지 않는 푸시 서비스입니다.");
  const [products, posts, comments] = lists(watch);
  await query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, fingerprint, products, posts, comments, daily)
     VALUES ($1, $2, $3, $4, $5::bigint[], $6::bigint[], $8::bigint[], COALESCE($9::boolean, false))
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, fingerprint = EXCLUDED.fingerprint,
       products = EXCLUDED.products, posts = EXCLUDED.posts, comments = EXCLUDED.comments, synced_at = now(), fail_count = 0,
       daily = COALESCE($9::boolean, push_subscriptions.daily)
       WHERE (push_subscriptions.p256dh = EXCLUDED.p256dh AND push_subscriptions.auth = EXCLUDED.auth) OR $7::boolean
     RETURNING id`,
    [sub.endpoint, sub.p256dh, sub.auth, fp, products, posts, token ? tokenOk(sub.endpoint, token) : false, comments, daily ?? null],
  ).then((rows) => {
    if (!rows[0]) throw new HttpError(409, "endpoint_taken", "이미 다른 설정으로 등록된 알림 주소입니다. 브라우저 알림을 껐다 다시 켜 주세요.");
  });
  return { token: subscriptionToken(sub.endpoint) };
}

/** 관심 목록이 바뀔 때마다 브라우저가 보낸다 */
export async function updateWatch(endpoint: string, token: string, watch: WatchLists, daily?: boolean): Promise<void> {
  checkToken(endpoint, token);
  const [products, posts, comments] = lists(watch);
  const res = await query<{ id: string }>(
    `UPDATE push_subscriptions SET products = $2::bigint[], posts = $3::bigint[], comments = $4::bigint[], synced_at = now(),
       daily = COALESCE($5::boolean, daily) WHERE endpoint = $1 RETURNING id`,
    [endpoint, products, posts, comments, daily ?? null],
  );
  if (!res[0]) throw notFound("알림 구독");
}

/** 🔥 오늘 할 일을 했다 (Sprint 80): 어제도 했으면 연속 +1, 오늘 이미 했으면 그대로, 아니면 1부터 */
export async function markActive(endpoint: string, token: string, day: string): Promise<number> {
  checkToken(endpoint, token);
  const res = await query<{ streak: number }>(
    `UPDATE push_subscriptions SET
       streak = CASE WHEN active_day = $2::date THEN streak WHEN active_day = $2::date - 1 THEN streak + 1 ELSE 1 END,
       active_day = $2::date
     WHERE endpoint = $1 RETURNING streak`,
    [endpoint, day],
  );
  if (!res[0]) throw notFound("알림 구독");
  return res[0].streak;
}

export async function unsubscribe(endpoint: string, token: string): Promise<void> {
  checkToken(endpoint, token);
  await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}

/** 🎫 이 방 행사 알림 켜기/끄기 (10/21). 켤 때부터의 새 행사만 보낸다 */
export async function setEventRoom(endpoint: string, token: string, slug: string, on: boolean): Promise<string[]> {
  checkToken(endpoint, token);
  const res = await query<{ event_rooms: string[] }>(
    `UPDATE push_subscriptions SET
       event_rooms = CASE WHEN $3 THEN (SELECT array_agg(DISTINCT r) FROM unnest(array_append(event_rooms, $2)) r)
                          ELSE array_remove(event_rooms, $2) END,
       event_checked_until = CASE WHEN $3 AND cardinality(event_rooms) = 0 THEN now() ELSE event_checked_until END,
       synced_at = now()
     WHERE endpoint = $1 RETURNING event_rooms`,
    [endpoint, slug, on],
  );
  if (!res[0]) throw notFound("알림 구독");
  return res[0].event_rooms;
}

/** 💰 매달 적립일 알림 (10/24): 1~28일, null 이면 끈다. 이번 달 그날이 이미 지났으면 다음 달부터 */
export async function setSavingsDay(endpoint: string, token: string, day: number | null): Promise<number | null> {
  checkToken(endpoint, token);
  const res = await query<{ savings_day: number | null }>(
    "UPDATE push_subscriptions SET savings_day = $2, synced_at = now() WHERE endpoint = $1 RETURNING savings_day",
    [endpoint, day],
  );
  if (!res[0]) throw notFound("알림 구독");
  return res[0].savings_day;
}

/** 📍 동네 체험 🔔 (10/24): 토큰이 맞는 구독의 번호 */
export async function subscriptionIdFor(endpoint: string, token: string): Promise<string> {
  checkToken(endpoint, token);
  const [row] = await query<{ id: string }>("SELECT id::text FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  if (!row) throw notFound("알림 구독");
  return row.id;
}

export type PushStats = { total: number; daily: number; eventSubs: number; rooms: { slug: string; n: number }[] };

/** 관리자: 푸시 알림 신청 현황 (10/22) — 전체 구독, 매일 알림, 🎫 행사 알림(방별) */
export async function pushStats(): Promise<PushStats> {
  const [row] = await query<{ total: number; daily: number; event_subs: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE daily)::int AS daily,
            count(*) FILTER (WHERE cardinality(event_rooms) > 0)::int AS event_subs
       FROM push_subscriptions`,
  );
  const rooms = await query<{ slug: string; n: number }>(
    "SELECT r AS slug, count(*)::int AS n FROM push_subscriptions, unnest(event_rooms) AS r GROUP BY r ORDER BY n DESC, r",
  );
  return { total: row?.total ?? 0, daily: row?.daily ?? 0, eventSubs: row?.event_subs ?? 0, rooms };
}
