import { route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { gameContact } from "@/lib/repo/tennisGames";

/** GET /api/tennis-games/:id/contact — 오픈채팅 링크·카톡 아이디 (버튼을 눌렀을 때만, 한 사람 시간당 60번) */
export const GET = route<{ id: string }>(async (req, { id }) => {
  if (!(await hit(`game:contact:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const contact = await gameContact(id);
  return new Response(JSON.stringify({ contact }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow, noarchive" },
  });
});
