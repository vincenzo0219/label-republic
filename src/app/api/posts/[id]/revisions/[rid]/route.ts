import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { redactRevision } from "@/lib/repo/posts";
import { pinOnlySchema } from "@/lib/validation";

/** DELETE /api/posts/:id/revisions/:rid {pw} — 작성자가 수정 이력의 이전 판 내용을 지운다 (시각만 남음) */
export const DELETE = route<{ id: string; rid: string }>(async (req, { id, rid }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  await redactRevision(id, rid, { kind: "author", fp: fingerprint(req.headers), pin: pw });
  return json({ ok: true });
});
