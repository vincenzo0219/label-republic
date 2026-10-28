import { z } from "zod";
import { config } from "@/lib/config";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { saveSimResult, simStats } from "@/lib/repo/someSim";
import { scoreSim } from "@/lib/someSim";

const schema = z.object({ picks: z.array(z.number().int()).max(20) });

/** GET /api/some-sim — 💬 썸 시뮬레이터 유형 분포 */
export const GET = route(async () => json(await simStats()));

/** POST /api/some-sim {picks} — 고른 보기로 서버에서 점수를 다시 계산해 저장하고 분포를 돌려준다. 익명(방문자 쿠키 해시만) */
export const POST = route(async (req) => {
  if (!(await hit(`somesim:${fingerprint(req.headers)}`, 20, 60 * 60 * 1000))) throw tooMany();
  const { picks } = await parseBody(req, schema);
  const r = scoreSim(picks);
  if (!r) throw new HttpError(400, "invalid_input", "8개 장면에 모두 답해 주세요.");
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  await saveSimResult(visitorHash(vid), r);
  const res = json({ ...r, ...(await simStats()) });
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
