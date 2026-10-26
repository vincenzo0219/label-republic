import { json, parseBody, route } from "@/lib/http";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { penaltyText } from "@/lib/eventGoing";
import { activePenalty, appealPenalty } from "@/lib/repo/eventGoing";
import { appealSchema } from "@/lib/validation";

/** GET /api/event-penalty: 이 기기의 조 신청 제한 (본인에게만) */
export const GET = route(async (req) => {
  const until = await activePenalty(fingerprint(req.headers));
  return json({ until: until?.toISOString() ?? null, text: until ? penaltyText(until) : null });
});

/** POST /api/event-penalty {text}: 이의제기 한 줄 (운영 화면으로) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`eappeal:${fp}`, 3, 24 * 3600_000))) throw tooMany();
  const { text } = await parseBody(req, appealSchema);
  if (!(await appealPenalty(fp, text))) throw new HttpError(404, "not_found", "이의제기할 기록이 없어요.");
  return json({ ok: true });
});
