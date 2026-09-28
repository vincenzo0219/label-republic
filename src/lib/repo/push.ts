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
import { MAX_WATCH_POSTS, MAX_WATCH_PRODUCTS } from "./watch";

export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string };
export type WatchLists = { products: string[]; posts: string[] };

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
  return [ids(w.products, MAX_WATCH_PRODUCTS), ids(w.posts, MAX_WATCH_POSTS)] as const;
}

/**
 * 같은 푸시 주소가 이미 있으면, 같은 브라우저가 다시 켜는 경우(암호화 키가 같음)나 토큰을 가진 경우에만 덮어쓴다.
 * 주소만 알아낸 사람이 키를 바꿔 알림을 가로채거나 토큰을 받아 가지 못하게.
 */
export async function subscribe(sub: SubscriptionInput, watch: WatchLists, fp: string, token?: string): Promise<{ token: string }> {
  if (!config.pushEnabled) throw new HttpError(503, "push_disabled", "이 서버에서는 푸시 알림을 쓸 수 없습니다.");
  if (!isAllowedEndpoint(sub.endpoint)) throw new HttpError(400, "invalid_endpoint", "지원하지 않는 푸시 서비스입니다.");
  const [products, posts] = lists(watch);
  await query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, fingerprint, products, posts)
     VALUES ($1, $2, $3, $4, $5::bigint[], $6::bigint[])
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, fingerprint = EXCLUDED.fingerprint,
       products = EXCLUDED.products, posts = EXCLUDED.posts, synced_at = now(), fail_count = 0
       WHERE (push_subscriptions.p256dh = EXCLUDED.p256dh AND push_subscriptions.auth = EXCLUDED.auth) OR $7::boolean
     RETURNING id`,
    [sub.endpoint, sub.p256dh, sub.auth, fp, products, posts, token ? tokenOk(sub.endpoint, token) : false],
  ).then((rows) => {
    if (!rows[0]) throw new HttpError(409, "endpoint_taken", "이미 다른 설정으로 등록된 알림 주소입니다. 브라우저 알림을 껐다 다시 켜 주세요.");
  });
  return { token: subscriptionToken(sub.endpoint) };
}

/** 관심 목록이 바뀔 때마다 브라우저가 보낸다 */
export async function updateWatch(endpoint: string, token: string, watch: WatchLists): Promise<void> {
  checkToken(endpoint, token);
  const [products, posts] = lists(watch);
  const res = await query<{ id: string }>(
    "UPDATE push_subscriptions SET products = $2::bigint[], posts = $3::bigint[], synced_at = now() WHERE endpoint = $1 RETURNING id",
    [endpoint, products, posts],
  );
  if (!res[0]) throw notFound("알림 구독");
}

export async function unsubscribe(endpoint: string, token: string): Promise<void> {
  checkToken(endpoint, token);
  await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}
