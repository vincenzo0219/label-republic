import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { kstDay, newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { answerQuiz, currentStreakInfo, myQuizAnswer, noteCount, quizTally, roomProgress, todayQuiz } from "@/lib/repo/roomQuizzes";

const slugRe = /^[\p{L}\p{N}-]{1,60}$/u;
const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/room-quiz?slug=방 — 🧩 오늘의 1분 퀴즈와 집계, 내가 고른 답 (10/29) */
export const GET = route(async (req) => {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!slugRe.test(slug)) return json(null);
  const day = kstDay();
  const t = await todayQuiz(slug, day);
  if (!t) return json(null);
  const vid = cookieOf(req);
  const vh = vid ? visitorHash(vid) : null;
  const s = vh ? await currentStreakInfo(vh, day) : { current: 0, best: 0, freezeLeft: 1 as const };
  const me = { streak: s.current, best: s.best, freezeLeft: s.freezeLeft };
  if (t.source === "poll") return json({ source: "poll", day, ...me });
  const [tally, mine, notes, progress] = await Promise.all([
    quizTally(slug, day),
    vh ? myQuizAnswer(slug, day, vh) : Promise.resolve(null),
    vh ? noteCount(vh) : Promise.resolve({ knowledge: 0, total: 0 }),
    vh ? roomProgress(vh, slug) : Promise.resolve(0),
  ]);
  return json({ source: t.source, day, quiz: t.quiz, tally, mine, notes, progress, ...me });
});

const schema = z.object({ slug: z.string().regex(slugRe), choice: z.number().int().min(0).max(3).optional(), picks: z.array(z.number().int().min(0).max(3)).max(4).optional() });

/** POST /api/room-quiz {slug, choice} 또는 {slug, picks} — 한 번 눌러 답하기. 한 브라우저 하루 한 번 */
export const POST = route(async (req) => {
  if (!(await hit(`quiz:answer:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const { slug, choice, picks } = await parseBody(req, schema);
  const res = json(await answerQuiz(slug, kstDay(), visitorHash(vid), { choice, picks }, fingerprint(req.headers)));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
