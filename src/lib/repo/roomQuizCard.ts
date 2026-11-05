/**
 * 🧩 방 맨 위 오늘의 1분 퀴즈 카드 한 장 (집계·내 답·연속 포함). /api/room-quiz GET 과 방 화면 서버 렌더가 같이 쓴다
 * (11/5 시작 쉬움 점검: 카드가 늦게 떠서 화면이 밀리던 것 → 방 화면에서 처음부터 같이 그린다)
 */
import { kstDay, visitorHash } from "../metrics";
import type { RoomQuiz } from "../roomQuizzes";
import { currentStreakInfo, myQuizAnswer, noteCount, quizTally, roomProgress, todayQuiz, type QuizTally } from "./roomQuizzes";

type Me = { streak: number; best: number; freezeLeft: 0 | 1 };
export type RoomQuizCard =
  | ({ source: "poll"; day: string } & Me)
  | ({ source: "db" | "builtin"; day: string; quiz: RoomQuiz; tally: QuizTally; mine: string | null; notes: { knowledge: number; total: number }; progress: number } & Me);

const VID_RE = /^[0-9a-f-]{36}$/;

/** vid: 방문자 쿠키 값 (없으면 null). 오늘 퀴즈가 없는 방이면 null */
export async function roomQuizCard(slug: string, vid: string | null | undefined): Promise<RoomQuizCard | null> {
  const day = kstDay();
  const t = await todayQuiz(slug, day);
  if (!t) return null;
  const vh = vid && VID_RE.test(vid) ? visitorHash(vid) : null;
  const s = vh ? await currentStreakInfo(vh, day) : { current: 0, best: 0, freezeLeft: 1 as const };
  const me: Me = { streak: s.current, best: s.best, freezeLeft: s.freezeLeft };
  if (t.source === "poll") return { source: "poll", day, ...me };
  const [tally, mine, notes, progress] = await Promise.all([
    quizTally(slug, day),
    vh ? myQuizAnswer(slug, day, vh) : Promise.resolve(null),
    vh ? noteCount(vh) : Promise.resolve({ knowledge: 0, total: 0 }),
    vh ? roomProgress(vh, slug) : Promise.resolve(0),
  ]);
  return { source: t.source, day, quiz: t.quiz, tally, mine, notes, progress, ...me };
}
