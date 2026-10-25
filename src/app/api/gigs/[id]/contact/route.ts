import { route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { gigContact } from "@/lib/repo/gigs";

/** GET /api/gigs/:id/contact — 연락처 (상세 화면에서 버튼을 눌렀을 때만, 한 사람 시간당 60번) */
export const GET = route<{ id: string }>(async (req, { id }) => {
  if (!(await hit(`gig:contact:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const contact = await gigContact(id);
  return new Response(JSON.stringify({ contact }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow, noarchive" },
  });
});
