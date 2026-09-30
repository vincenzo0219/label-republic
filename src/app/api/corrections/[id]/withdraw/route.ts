import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { withdrawCorrection } from "@/lib/repo/corrections";
import { pinOnlySchema } from "@/lib/validation";

/** POST /api/corrections/:id/withdraw {pw} — 제안자 철회 (제안 비밀번호) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  return json({ correction: await withdrawCorrection(id, fingerprint(req.headers), pw) });
});
