import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { replaceSummary } from "@/lib/repo/posts";
import { regenerateSummarySchema } from "@/lib/validation";

/**
 * POST /api/posts/:id/summary {pw, summary?}
 * 등록된 글의 3줄 요약을 AI로 재생성하거나(summary 생략) 작성자 수정본으로 교체한다.
 * 글쓰기 단계(글 등록 전)의 미리보기는 POST /api/summary/preview 를 사용한다.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const input = await parseBody(req, regenerateSummarySchema);
  const post = await replaceSummary(id, fingerprint(req.headers), input.pw, input.summary);
  return json({ post });
});
