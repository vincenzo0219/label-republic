import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { deleteGame, updateGame } from "@/lib/repo/tennisGames";
import { pinOnlySchema } from "@/lib/validation";

/** PATCH /api/tennis-games/:id {pw, ...칸} — 글쓴이 수정 */
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const body = await parseBody(req, z.object({ pw: z.string() }).passthrough());
  await updateGame(id, fingerprint(req.headers), body as Parameters<typeof updateGame>[2]);
  return json({ ok: true });
});

/** DELETE /api/tennis-games/:id {pw} — 글쓴이 삭제 */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  await deleteGame(id, fingerprint(req.headers), pw);
  return json({ ok: true });
});
