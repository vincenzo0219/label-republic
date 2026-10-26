import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { verifiedEventMember } from "@/lib/comment-token";
import { checkIn, confirmMet, groupView, joinGroup, leaveGroup, postGroupMessage, reportEventTarget, setShowBadge } from "@/lib/repo/eventGoing";
import { eventGroupActionSchema } from "@/lib/validation";

type P = { gid: string };

/** GET /api/event-groups/:gid (x-member-token: 번호.증표): 조원만: 모임 정보·조원·채팅 */
export const GET = route<P>(async (req, { gid }) => {
  return json(await groupView(gid, verifiedEventMember(req.headers.get("x-member-token"))));
});

/**
 * POST /api/event-groups/:gid {action, ...}
 * join(닉네임+PIN) · message · leave · checkin(좌표는 500m 판정에만 쓰고 저장하지 않음) · confirm(만났어요) · badge · report
 */
export const POST = route<P>(async (req, { gid }) => {
  const fp = fingerprint(req.headers);
  const b = await parseBody(req, eventGroupActionSchema);
  const limit = b.action === "message" ? 20 : b.action === "report" ? 20 : 30;
  if (!(await hit(`egroup-${b.action}:${fp}`, limit, b.action === "report" ? 60 * 60_000 : 60_000))) throw tooMany();
  const member = "token" in b ? verifiedEventMember(b.token) : null;
  switch (b.action) {
    case "join":
      return json(await joinGroup(gid, fp, b.nickname, b.pw, new Date(), b.agree === true));
    case "message":
      return json(await postGroupMessage(gid, member, b.body));
    case "leave":
      return json(await leaveGroup(gid, member));
    case "checkin":
      return json(await checkIn(gid, member, b.lat !== undefined && b.lng !== undefined ? { lat: b.lat, lng: b.lng } : null));
    case "confirm":
      await confirmMet(gid, member, b.member);
      return json({ ok: true });
    case "badge":
      await setShowBadge(gid, member, b.on);
      return json({ ok: true });
    case "report":
      return json(await reportEventTarget(gid, fp, b.target, b.targetId ?? null, b.reason, member));
  }
});
