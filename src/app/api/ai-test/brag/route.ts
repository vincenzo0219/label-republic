import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { markAiBrag } from "@/lib/repo/aiTest";

/**
 * POST /api/ai-test/brag — AI 판별 테스트 결과에서 인증 댓글을 남겼다고 기록한다 (Sprint 68).
 * 테스트 → 커뮤니티 전환을 재기 위한 것이라 방문자 쿠키가 없거나 결과가 없으면 조용히 무시한다.
 */
export const POST = route(async (req) => {
  if (!(await hit(`ai-brag:${fingerprint(req.headers)}`, 20, 60 * 60 * 1000))) throw tooMany();
  await parseBody(req, z.object({}));
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const marked = cookie ? await markAiBrag(visitorHash(cookie)) : false;
  return json({ marked });
});
