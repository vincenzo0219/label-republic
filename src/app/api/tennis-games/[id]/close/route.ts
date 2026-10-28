import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { closeGame } from "@/lib/repo/tennisGames";
import { pinOnlySchema } from "@/lib/validation";

/** POST /api/tennis-games/:id/close {pw} — 글쓴이 마감 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  await closeGame(id, fingerprint(req.headers), pw);
  return json({ ok: true });
});
