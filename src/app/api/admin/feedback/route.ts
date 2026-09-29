import { z } from "zod";
import { FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/feedback";
import { json, parseBody, route } from "@/lib/http";
import { updateFeedback } from "@/lib/repo/feedback";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.object({
  id: z.string().regex(/^\d{1,18}$/, "번호를 확인하세요."),
  status: z.enum(Object.keys(FEEDBACK_STATUS) as [FeedbackStatus, ...FeedbackStatus[]]),
  // 공개 답변은 현황판에 그대로 실린다 — 제보자·개인정보를 적지 말 것
  note: z.string().trim().max(500).default(""),
  duplicateOf: z.string().regex(/^\d{1,18}$/).optional().nullable(),
});

/** POST /api/admin/feedback {id, status, note, duplicateOf?} — 제보 상태·공개 답변 */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  await updateFeedback(input.id, { status: input.status, note: input.note, duplicateOf: input.duplicateOf ?? null });
  return json({ ok: true });
});
