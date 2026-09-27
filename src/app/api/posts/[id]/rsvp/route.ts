import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { listParticipants, toggleRsvp } from "@/lib/repo/meetups";
import { rsvpSchema } from "@/lib/validation";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => json({ participants: await listParticipants(id) }));

/**
 * POST /api/posts/:id/rsvp {nickname} — 정모 참가 토글 (fingerprint당 1인)
 * 참가자가 확정 인원에 도달하면 사람 승인 없이 자동 확정된다.
 */
export const POST = route<P>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!hit(`rsvp:${fp}`, 20, 60 * 1000)) throw tooMany();
  const { nickname } = await parseBody(req, rsvpSchema);
  const result = await toggleRsvp(id, fp, nickname);
  return json({ ...result, participants: await listParticipants(id) });
});
