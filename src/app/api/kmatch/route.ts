import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { KMATCH_MAX_MS, KMATCH_MAX_WRONG, kmatchBoard, kmatchDayNumber, kmatchScore } from "@/lib/kMatch";
import { kstDay, newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { insertDailyPlay, todayDailyScore } from "@/lib/repo/dailyGames";
import { cleanNick } from "@/lib/repo/roomBoards";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/kmatch — 🏟️ 오늘의 구단 6개·홈구장 6개(섞은 순서)와 오늘 내 랭킹 기록 (11/4) */
export const GET = route(async (req) => {
  const day = kstDay();
  const vid = cookieOf(req);
  return json({ day, no: kmatchDayNumber(day) + 1, board: kmatchBoard(day), played: await todayDailyScore("kmatch", vid ? visitorHash(vid) : null) });
});

const schema = z.object({
  ms: z.number().int().min(0).max(KMATCH_MAX_MS),
  wrong: z.number().int().min(0).max(KMATCH_MAX_WRONG),
  nickname: z.string().max(20).nullish(),
});

/** POST /api/kmatch {ms, wrong, nickname?} — 점수 = 걸린 시간 + 틀린 수 × 3초. 오늘 첫 판만 랭킹에 남는다 */
export const POST = route(async (req) => {
  if (!(await hit(`kmatch:play:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const { ms, wrong, nickname } = await parseBody(req, schema);
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const score = kmatchScore(ms, wrong);
  const ranked = await insertDailyPlay("kmatch", visitorHash(vid), score, cleanNick(nickname));
  const res = json({ score, ranked });
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
