import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { kstDay, newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { debateTally, latestBookPoll, latestRoomPoll, voteDebate } from "@/lib/repo/debateVotes";
import { notePollVote, recordQuizDay, roomPollDay } from "@/lib/repo/roomQuizzes";

const schema = z.object({ postId: z.string().regex(/^\d{1,18}$/), side: z.enum(["A", "B"]), gender: z.enum(["m", "f"]).optional() });

/** POST /api/debate/vote {postId, side, gender?} — gender 는 👫 미혼남녀방 투표만 남긴다 (10/29). 사람 한 표 (Sprint 74). 익명, 방문자 쿠키 해시당 한 표 */
export const POST = route(async (req) => {
  if (!(await hit(`debate:vote:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  const { postId, side, gender } = await parseBody(req, schema);
  const tally = await voteDebate(postId, visitorHash(vid), side, gender);
  // 🔥 방 오늘의 질문에 답한 것도 연속 참여로 센다 (10/29)
  const pollDay = await roomPollDay(postId);
  const streak = pollDay === kstDay() ? await recordQuizDay(pollDay, visitorHash(vid), fingerprint(req.headers)) : undefined;
  if (pollDay === kstDay()) await notePollVote(postId, visitorHash(vid), side, pollDay).catch(() => {});
  const res = json(streak === undefined ? tally : { ...tally, streak });
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});

/** GET /api/debate/vote?kind=bookpoll — 가장 최근 📚 오늘의 책 질문과 집계 (Sprint 77, 테스트 결과 화면용) */
export const GET = route(async (req) => {
  // ?kind=room&slug=방 — 그 방의 🗳 오늘의 질문 (Sprint 83)
  const sp = new URL(req.url).searchParams;
  const slug = sp.get("kind") === "room" ? (sp.get("slug") ?? "").slice(0, 60) : null;
  const poll = slug ? await latestRoomPoll(slug) : await latestBookPoll();
  if (!poll) return json(null);
  return json({ postId: poll.id, title: poll.title, tally: await debateTally(poll.id) });
});
