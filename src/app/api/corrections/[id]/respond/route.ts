import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { respondCorrection } from "@/lib/repo/corrections";
import { correctionRespondSchema } from "@/lib/validation";

/** POST /api/corrections/:id/respond {pw, action: applied|answered, note} — 글 작성자 응답 (글 비밀번호) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const input = await parseBody(req, correctionRespondSchema);
  return json({ correction: await respondCorrection(id, fingerprint(req.headers), input.pw, input.action, input.note) });
});
