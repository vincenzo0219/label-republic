import { HttpError } from "@/lib/errors";
import { json, route } from "@/lib/http";
import { getChallenge } from "@/lib/repo/rallyChallenges";

/** GET /api/rally/challenges/:id — 🎾 도전장 (목표·보낸 이름·공 순서 seed · 도전한 사람 수·성공한 사람 수) */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const c = await getChallenge(id);
  if (!c) throw new HttpError(404, "no_challenge", "도전장을 찾지 못했어요");
  return json(c);
});
