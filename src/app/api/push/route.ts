import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { verifiedCommentIds } from "@/lib/comment-token";
import { subscribe, unsubscribe, updateWatch } from "@/lib/repo/push";

const ids = z.array(z.string().regex(/^\d{1,18}$/)).max(50).default([]);
/** 내 댓글 "번호.증표" (답글·멘션 알림, Sprint 30·33) — 증표가 맞는 것만 저장 */
const commentIds = z.array(z.string().max(40)).max(100).default([]).transform((xs) => verifiedCommentIds(xs, 100));
const endpoint = z.string().url().max(1000);
const token = z.string().min(10).max(100);

const subscribeSchema = z.object({
  subscription: z.object({ endpoint, keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }) }),
  products: ids,
  posts: ids,
  comments: commentIds,
  /** 이미 켠 브라우저가 키를 바꿔 다시 등록할 때 */
  token: token.optional(),
});
const updateSchema = z.object({ endpoint, token, products: ids, posts: ids, comments: commentIds });
const deleteSchema = z.object({ endpoint, token });

/** GET /api/push — 이 서버에서 푸시를 쓸 수 있는지 + VAPID 공개키 */
export const GET = route(async () => json({ enabled: config.pushEnabled, publicKey: config.pushEnabled ? config.vapidPublicKey : null }));

/** POST /api/push — 알림 켜기 {subscription, products, posts} → {token} */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`push:subscribe:${fp}`, 10, 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, subscribeSchema);
  const r = await subscribe(
    { endpoint: input.subscription.endpoint, p256dh: input.subscription.keys.p256dh, auth: input.subscription.keys.auth },
    { products: input.products, posts: input.posts, comments: input.comments },
    fp,
    input.token,
  );
  return json(r, 201);
});

/** PUT /api/push — 관심 목록 갱신 {endpoint, token, products, posts, comments} */
export const PUT = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`push:update:${fp}`, 120, 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, updateSchema);
  await updateWatch(input.endpoint, input.token, { products: input.products, posts: input.posts, comments: input.comments });
  return json({ ok: true });
});

/** DELETE /api/push — 알림 끄기 (서버에서 구독 정보 삭제) */
export const DELETE = route(async (req) => {
  const input = await parseBody(req, deleteSchema);
  await unsubscribe(input.endpoint, input.token);
  return json({ ok: true });
});
