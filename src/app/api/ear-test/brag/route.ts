import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { markEarBrag } from "@/lib/repo/earTest";

/**
 * POST /api/ear-test/brag — 결과 화면에서 "점수 인증하기"를 눌렀다고 남긴다 (Sprint 60).
 * 테스트 → 커뮤니티 전환을 재기 위한 것이라 방문자 쿠키가 없거나 결과가 없으면 조용히 무시한다.
 */
export const POST = route(async (req) => {
  if (!(await hit(`ear-brag:${fingerprint(req.headers)}`, 20, 60 * 60 * 1000))) throw tooMany();
  await parseBody(req, z.object({}));
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const marked = cookie ? await markEarBrag(visitorHash(cookie)) : false;
  return json({ marked });
});
