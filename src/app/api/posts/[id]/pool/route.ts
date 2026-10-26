import { json, parseBody, route } from "@/lib/http";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { verifiedEventPool } from "@/lib/comment-token";
import { cancelPool, joinPool, poolStatus } from "@/lib/repo/eventGoing";
import { subscriptionIdFor } from "@/lib/repo/push";
import { poolRefSchema, poolSchema } from "@/lib/validation";

type P = { id: string };

/** GET /api/posts/:id/pool?t=번호.증표: 내 조 신청 상태 (신청됨 · 조 편성됨 · 조 안 됨) */
export const GET = route<P>(async (req) => {
  const id = verifiedEventPool(new URL(req.url).searchParams.get("t"));
  const st = id ? await poolStatus(id) : null;
  return json({ status: st });
});

/** POST /api/posts/:id/pool: 🙌 혼자 가요, 조 짜 주세요 (만 14세 이상, 닉네임 + PIN). {t: "번호.증표"} 면 취소 */
export const POST = route<P>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`epool:${fp}`, 10, 10 * 60_000))) throw tooMany();
  const raw = (await req.clone().json().catch(() => null)) as { t?: unknown } | null;
  if (raw && typeof raw.t === "string") {
    const { t } = await parseBody(req, poolRefSchema);
    const pid = verifiedEventPool(t);
    if (!pid) throw new HttpError(403, "invalid_token", "이 브라우저에서 신청한 것만 취소할 수 있어요.");
    return json(await cancelPool(pid));
  }
  const b = await parseBody(req, poolSchema);
  const subscriptionId = b.push ? await subscriptionIdFor(b.push.endpoint, b.push.token).catch(() => null) : null;
  return json(await joinPool(id, fp, { day: b.day, slot: b.slot, age: b.age, nickname: b.nickname, pin: b.pw, subscriptionId }));
});
