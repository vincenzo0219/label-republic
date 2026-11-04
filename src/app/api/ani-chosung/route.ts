import { z } from "zod";
import { ANI_MAX_MS, ANI_MIN_MS, ANI_PER_DAY, aniDailyQuestions, aniDayNumber, aniEncode, gradeAni } from "@/lib/aniChosung";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { kstDay, newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { insertDailyPlay, todayDailyScore } from "@/lib/repo/dailyGames";
import { cleanNick } from "@/lib/repo/roomBoards";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/ani-chosung — 🎨 오늘의 초성 문제(정답 없이 초성·글자 수·정답 지문)와 오늘 내 랭킹 기록 (11/4) */
export const GET = route(async (req) => {
  const day = kstDay();
  const vid = cookieOf(req);
  return json({ day, no: aniDayNumber(day) + 1, questions: aniDailyQuestions(day), played: await todayDailyScore("anichosung", vid ? visitorHash(vid) : null) });
});

const schema = z.object({
  /** 문제 순서대로 적은 답 (건너뛴 문제는 빈 칸). 60초 안에 본 문제까지만 */
  answers: z.array(z.string().max(60)).max(ANI_PER_DAY),
  /** 마지막으로 맞힌 시각 (시작부터 ms) */
  lastMs: z.number().int().min(0).max(ANI_MAX_MS + 5000),
  nickname: z.string().max(20).nullish(),
});

/** POST /api/ani-chosung {answers, lastMs, nickname?} — 서버가 채점. 오늘 첫 판만 랭킹에 남는다 */
export const POST = route(async (req) => {
  if (!(await hit(`anichosung:play:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const { answers, lastMs, nickname } = await parseBody(req, schema);
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const { correct, results } = gradeAni(kstDay(), answers);
  const score = aniEncode(correct, correct ? Math.min(ANI_MAX_MS, Math.max(ANI_MIN_MS, lastMs)) : ANI_MAX_MS);
  const ranked = await insertDailyPlay("anichosung", visitorHash(vid), score, cleanNick(nickname));
  const res = json({ correct, score, ranked, results });
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
