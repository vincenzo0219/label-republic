import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { applyLegalHold, LEGAL_REASONS, releaseLegalHold, type LegalReason } from "@/lib/repo/legal";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("hold"),
    postId: z.string().regex(/^\d{1,18}$/, "게시글 번호를 확인하세요."),
    reason: z.enum(Object.keys(LEGAL_REASONS) as [LegalReason, ...LegalReason[]]),
    note: z.string().trim().max(300).default(""),
  }),
  z.object({
    action: z.literal("release"),
    postId: z.string().regex(/^\d{1,18}$/, "게시글 번호를 확인하세요."),
    note: z.string().trim().max(300).default(""),
  }),
]);

/** POST /api/admin/legal-hold — 임시조치 적용/해제 (공개 투명성 기록에 남음) */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  if (input.action === "hold") {
    await applyLegalHold(input.postId, input.reason, input.note);
    return json({ ok: true });
  }
  return json({ ok: true, ...(await releaseLegalHold(input.postId, input.note)) });
});
