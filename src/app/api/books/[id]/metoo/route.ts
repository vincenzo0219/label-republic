import { meTooSchema } from "@/lib/books-schema";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { meToo } from "@/lib/repo/books";

/** POST /api/books/:id/metoo {nickname} — 📖 나도 읽었어요 (Sprint 82). 이미 기록이 있으면 그대로 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`book:metoo:${fp}`, 60, 60 * 60 * 1000))) throw tooMany();
  const { nickname } = await parseBody(req, meTooSchema);
  return json({ readers: await meToo(id, fp, nickname) });
});
