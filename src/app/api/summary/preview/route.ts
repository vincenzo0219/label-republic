import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { generateSummary, signSummary } from "@/lib/summary";
import { summaryPreviewSchema } from "@/lib/validation";

/**
 * POST /api/summary/preview {title, body} → {lines, model, token}
 * 글쓰기 단계의 AI 3줄 요약 미리보기. token은 등록 시 함께 보내면 작성자 수정 여부가 기록된다.
 */
export const POST = route(async (req) => {
  if (!hit(`summary:${fingerprint(req.headers)}`, 10, 60 * 1000)) throw tooMany();
  const { title, body } = await parseBody(req, summaryPreviewSchema);
  const summary = await generateSummary(title, body);
  return json({ lines: summary.lines, model: summary.model, token: signSummary(summary) });
});
