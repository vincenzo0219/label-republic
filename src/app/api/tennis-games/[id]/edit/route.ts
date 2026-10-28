import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { gameForOwner } from "@/lib/repo/tennisGames";
import { pinOnlySchema } from "@/lib/validation";

/** POST /api/tennis-games/:id/edit {pw} — 수정 화면에 채울 값 (연락처 포함, 글쓴이만) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  return json({ game: await gameForOwner(id, fingerprint(req.headers), pw) });
});
