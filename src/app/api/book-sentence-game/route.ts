import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { dailyQuestions, dayNumber, QUESTIONS_PER_DAY } from "@/lib/firstSentenceGame";
import { json, parseBody, route } from "@/lib/http";
import { kstDay, newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { playSentenceGame, todayPlay } from "@/lib/repo/firstSentenceGame";
import { cleanNick } from "@/lib/repo/roomBoards";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/book-sentence-game — 📖 오늘의 10문제(정답 없이)와 오늘 내 랭킹 기록 (11/4) */
export const GET = route(async (req) => {
  const day = kstDay();
  const vid = cookieOf(req);
  return json({ day, no: dayNumber(day) + 1, questions: dailyQuestions(day), played: await todayPlay(vid ? visitorHash(vid) : null) });
});

const schema = z.object({
  picks: z.array(z.string().max(60).nullable()).length(QUESTIONS_PER_DAY),
  ms: z.number().int().min(0).max(10_000_000),
  nickname: z.string().max(20).nullish(),
});

/** POST /api/book-sentence-game {picks, ms, nickname?} — 서버가 채점. 오늘 첫 판만 랭킹에 남는다 */
export const POST = route(async (req) => {
  if (!(await hit(`booksent:play:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const { picks, ms, nickname } = await parseBody(req, schema);
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const res = json(await playSentenceGame(visitorHash(vid), picks, ms, cleanNick(nickname)));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
