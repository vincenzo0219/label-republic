import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { createOpenGroup, listOpenGroups } from "@/lib/repo/eventGoing";
import { openGroupSchema } from "@/lib/validation";

type P = { id: string };

/** GET /api/posts/:id/groups: 이 행사의 같이 가요 모집 (날짜·정원·한 줄) */
export const GET = route<P>(async (_req, { id }) => json({ groups: await listOpenGroups(id) }));

/** POST /api/posts/:id/groups: 같이 가요 모집 열기 (연 사람이 첫 참여자). 돌려준 증표로 채팅을 본다 */
export const POST = route<P>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`egroup-new:${fp}`, 5, 60 * 60_000))) throw tooMany();
  const b = await parseBody(req, openGroupSchema);
  return json(await createOpenGroup(id, fp, { day: b.day, meetTime: b.meetTime, place: b.place, capacity: b.capacity, intro: b.intro, nickname: b.nickname, pin: b.pw }));
});
