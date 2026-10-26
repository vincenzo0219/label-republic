import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { goingSummary, toggleGoing } from "@/lib/repo/eventGoing";
import { subscriptionIdFor } from "@/lib/repo/push";
import { goingSchema } from "@/lib/validation";

type P = { id: string };

/** GET /api/posts/:id/going: 같이 갈 사람 수(3명부터 보임)와 내가 눌렀는지 */
export const GET = route<P>(async (req, { id }) => json(await goingSummary(id, fingerprint(req.headers))));

/**
 * POST /api/posts/:id/going {nickname?, push?: {endpoint, token}}: 🙋 갈 거예요 토글 (브라우저당 하나, 로그인 없음).
 * push 증표가 맞으면 3일 전 알림을 받을 구독으로 이어 둔다.
 */
export const POST = route<P>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`going:${fp}`, 20, 60_000))) throw tooMany();
  const body = await parseBody(req, goingSchema);
  const subscriptionId = body.push ? await subscriptionIdFor(body.push.endpoint, body.push.token).catch(() => null) : null;
  return json(await toggleGoing(id, fp, { nickname: body.nickname ?? null, subscriptionId }));
});
