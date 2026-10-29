/**
 * 🧩 오늘의 1분 퀴즈 저장소 (10/29). 내용 규칙은 src/lib/roomQuizzes.ts 맨 위 (공감 가는 일상 질문, 정답 문제 X).
 */
import { query } from "../db";
import { HttpError } from "../errors";
import { ROOM_POLLS, roomPollTopic } from "../roomPolls";
import { builtinQuiz, pct, QUIZ_EXCLUDED, quizProblem, scoreType, type RoomQuiz } from "../roomQuizzes";

const SINGLES = "미혼남녀-만남-행사";

export type TodayQuiz = { source: "db" | "builtin"; quiz: RoomQuiz } | { source: "poll" } | null;

/** 오늘 이 방 맨 위에 무엇을 보일지: 운영자 줄 > 기존 오늘의 질문(ROOM_POLLS) > 기본 목록. 💌 미혼남녀방은 늘 썸 카톡 */
export async function todayQuiz(slug: string, day: string): Promise<TodayQuiz> {
  if (QUIZ_EXCLUDED.has(slug)) return null;
  if (slug === SINGLES) return { source: "poll" };
  const [row] = await query<{ kind: RoomQuiz["kind"]; payload: RoomQuiz }>("SELECT kind, payload FROM room_quizzes WHERE room = $1 AND day = $2", [slug, day]);
  if (row) return { source: "db", quiz: { ...row.payload, kind: row.kind } as RoomQuiz };
  const b = builtinQuiz(slug, day);
  return b ? { source: "builtin", quiz: b } : null;
}

export type QuizTally = { total: number; counts: Record<string, number> };

export async function quizTally(slug: string, day: string): Promise<QuizTally> {
  const rows = await query<{ k: string; n: number }>(
    "SELECT coalesce(result, choice::text) AS k, count(*)::int AS n FROM quiz_answers WHERE room = $1 AND day = $2 GROUP BY 1",
    [slug, day],
  );
  return { total: rows.reduce((s, r) => s + r.n, 0), counts: Object.fromEntries(rows.map((r) => [r.k, r.n])) };
}

export async function myQuizAnswer(slug: string, day: string, visitor: string): Promise<string | null> {
  const [r] = await query<{ k: string }>("SELECT coalesce(result, choice::text) AS k FROM quiz_answers WHERE room = $1 AND day = $2 AND visitor_hash = $3", [slug, day, visitor]);
  return r?.k ?? null;
}

/** 답하기: pick 은 choice(번호), type 은 picks(질문마다 번호) → 결과 유형. 한 브라우저 하루 한 번 (두 번째부터는 첫 답 그대로) */
export async function answerQuiz(slug: string, day: string, visitor: string, input: { choice?: number; picks?: number[] }, fp?: string | null): Promise<{ mine: string; tally: QuizTally; streak: number; best: number; freezeLeft: 0 | 1; notes: { knowledge: number; total: number }; progress: number }> {
  const t = await todayQuiz(slug, day);
  if (!t || t.source === "poll") throw new HttpError(404, "no_quiz", "오늘 퀴즈가 없어요");
  const q = t.quiz;
  let choice: number | null = null;
  let result: string | null = null;
  if (q.kind === "pick" || q.kind === "trivia") {
    if (input.choice === undefined || !Number.isInteger(input.choice) || input.choice < 0 || input.choice >= q.options.length) throw new HttpError(400, "invalid_input", "보기를 골라 주세요");
    choice = input.choice;
  } else {
    result = scoreType(q, input.picks ?? []);
    if (!result) throw new HttpError(400, "invalid_input", "모든 질문에 답해 주세요");
  }
  const inserted = await query(
    "INSERT INTO quiz_answers (room, day, visitor_hash, choice, result) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (room, day, visitor_hash) DO NOTHING RETURNING room",
    [slug, day, visitor, choice, result],
  );
  const streak = await recordQuizDayInfo(day, visitor, fp);
  const tally = await quizTally(slug, day);
  const mine = (await myQuizAnswer(slug, day, visitor))!;
  if (inserted.length) {
    // 📚 지식 카드 / 내 취향 기록 (그때의 질문·답을 그대로 남긴다)
    const same = pct(tally.counts[mine] ?? 0, tally.total);
    if (q.kind === "trivia")
      await addNote(visitor, slug, day, { kind: "trivia", question: q.q, answer: q.options[q.answer]!, why: q.why, source: q.source, correct: choice === q.answer });
    else if (q.kind === "pick") await addNote(visitor, slug, day, { kind: "pick", question: q.q, answer: q.options[choice!]!, samePct: same });
    else await addNote(visitor, slug, day, { kind: "type", question: q.title, answer: q.results[result!]?.name ?? result!, why: q.results[result!]?.line ?? "", samePct: same });
  }
  const [notes, progress] = await Promise.all([noteCount(visitor), roomProgress(visitor, slug)]);
  return { mine, tally, streak: streak.current, best: streak.best, freezeLeft: streak.freezeLeft, notes, progress };
}

type NoteInput = { kind: "trivia" | "pick" | "type" | "poll" | "welcome"; question: string; answer: string; why?: string; source?: string; correct?: boolean; samePct?: number };

export async function addNote(visitor: string, room: string, day: string, n: NoteInput): Promise<void> {
  // 🎁 그 방 첫 기록이면 웰컴 카드도 하나 (박사까지 10개에 들어간다, 0에서 시작하지 않게)
  if (n.kind !== "welcome") {
    const [has] = await query("SELECT 1 FROM quiz_notes WHERE visitor_hash = $1 AND room = $2 LIMIT 1", [visitor, room]);
    if (!has) await addNote(visitor, room, day, { kind: "welcome", question: "🎁 웰컴 카드", answer: "이 방 노트를 시작했어요" });
  }
  await query(
    `INSERT INTO quiz_notes (visitor_hash, room, day, kind, question, answer_text, why, source, correct, same_pct)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
    [visitor, room, day, n.kind, n.question.slice(0, 200), n.answer.slice(0, 100), (n.why ?? "").slice(0, 200), n.source ?? "", n.correct ?? null, n.samePct ?? null],
  );
}

/** 📚 쌓인 카드 수: 지식(정답 퀴즈)과 전체 */
export async function noteCount(visitor: string): Promise<{ knowledge: number; total: number }> {
  const [r] = await query<{ knowledge: number; total: number }>(
    "SELECT count(*) FILTER (WHERE kind IN ('trivia', 'welcome'))::int AS knowledge, count(*)::int AS total FROM quiz_notes WHERE visitor_hash = $1",
    [visitor],
  );
  return r ?? { knowledge: 0, total: 0 };
}

/** 방 노트 카드(지식+취향, 웰컴 포함) 이만큼 모이면 "○○ 박사". 맞든 틀리든 답할 때마다 +1 */
export const NOTE_TITLE_MIN = 10;

/** 이 방 노트 카드 수 (웰컴 카드 포함, 박사까지 n/10) */
export async function roomProgress(visitor: string, room: string): Promise<number> {
  const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM quiz_notes WHERE visitor_hash = $1 AND room = $2", [visitor, room]);
  return r?.n ?? 0;
}

export type NoteRoom = { room: string; name: string; knowledge: number; taste: number; doctor: boolean };

/** 📚 내 지식 노트: 방마다 지식·취향 수 (많은 순) */
export async function noteRooms(visitor: string): Promise<NoteRoom[]> {
  const rows = await query<{ room: string; name: string | null; knowledge: number; taste: number }>(
    `SELECT n.room, c.name, count(*) FILTER (WHERE n.kind IN ('trivia', 'welcome'))::int AS knowledge, count(*) FILTER (WHERE n.kind NOT IN ('trivia', 'welcome'))::int AS taste
       FROM quiz_notes n LEFT JOIN categories c ON c.slug = n.room WHERE n.visitor_hash = $1
      GROUP BY n.room, c.name ORDER BY count(*) DESC, n.room`,
    [visitor],
  );
  return rows.map((r) => ({ room: r.room, name: r.name ?? r.room, knowledge: r.knowledge, taste: r.taste, doctor: r.knowledge + r.taste >= NOTE_TITLE_MIN }));
}

export type Note = { day: string; kind: string; question: string; answer: string; why: string; source: string; correct: boolean | null; samePct: number | null };

export async function roomNotes(visitor: string, room: string): Promise<Note[]> {
  return query<Note>(
    `SELECT day::text AS day, kind, question, answer_text AS answer, why, source, correct, same_pct AS "samePct"
       FROM quiz_notes WHERE visitor_hash = $1 AND room = $2 ORDER BY day DESC LIMIT 200`,
    [visitor, room],
  );
}

/** 방 오늘의 질문(roompoll) 투표도 내 취향 기록으로 */
export async function notePollVote(postId: string, visitor: string, side: "A" | "B", day: string): Promise<void> {
  const [p] = await query<{ seed_key: string; title: string }>("SELECT seed_key, title FROM posts WHERE id = $1", [postId]);
  const m = p?.seed_key.match(/^roompoll:(.+):(\d{4}-\d{2}-\d{2})$/);
  if (!m || m[2] !== day) return;
  const topic = roomPollTopic(m[1]!, day);
  if (!topic) return;
  await addNote(visitor, m[1]!, day, { kind: "poll", question: p!.title.replace(/^\[[^\]]+\]\s*/, ""), answer: side === "A" ? topic[0] : topic[1] });
}

const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export type StreakInfo = { current: number; best: number; freezeLeft: 0 | 1 };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
/** 🧊 쉬는 날: 7일에 한 번 (마지막으로 쓴 날에서 7일이 지났거나 안 썼으면 남아 있다) */
const freezeOk = (used: string | null, day: string) => !used || daysBetween(used, day) >= 7;

/** 다음 연속 일수 (순수 함수, 테스트용): 어제 답했으면 +1, 이틀 전이면 쉬는 날을 써서 +1, 오늘 이미 했으면 그대로, 아니면 1 */
export function nextStreak(prev: { current: number; best: number; last_day: string; freeze_used: string | null } | null, day: string): { current: number; best: number; last_day: string; freeze_used: string | null } {
  if (!prev) return { current: 1, best: 1, last_day: day, freeze_used: null };
  const gap = daysBetween(prev.last_day, day);
  if (gap <= 0) return prev;
  let current = 1;
  let freeze = prev.freeze_used;
  if (gap === 1) current = prev.current + 1;
  else if (gap === 2 && freezeOk(prev.freeze_used, day)) {
    current = prev.current + 1;
    freeze = dayBefore(day);
  }
  return { current, best: Math.max(prev.best, current), last_day: day, freeze_used: freeze };
}

/** 🔥 오늘 답했다: 방문자·지문 키마다 연속 일수를 올린다. 방문자 키의 정보를 돌려준다 (끊겨도 혼내지 않는다: 1부터 다시) */
export async function recordQuizDay(day: string, visitor: string, fp?: string | null): Promise<number> {
  return (await recordQuizDayInfo(day, visitor, fp)).current;
}

export async function recordQuizDayInfo(day: string, visitor: string, fp?: string | null): Promise<StreakInfo> {
  const keys = [`v:${visitor}`, ...(fp ? [`f:${fp}`] : [])];
  let info: StreakInfo = { current: 1, best: 1, freezeLeft: 1 };
  for (const key of keys) {
    const [prev] = await query<{ current: number; best: number; last_day: string; freeze_used: string | null }>(
      "SELECT current, best, last_day::text AS last_day, freeze_used::text AS freeze_used FROM quiz_streaks WHERE key = $1",
      [key],
    );
    const n = nextStreak(prev ?? null, day);
    await query(
      `INSERT INTO quiz_streaks (key, current, best, last_day, freeze_used) VALUES ($1, $2, $3, $4::date, $5::date)
       ON CONFLICT (key) DO UPDATE SET current = EXCLUDED.current, best = EXCLUDED.best, last_day = EXCLUDED.last_day, freeze_used = EXCLUDED.freeze_used`,
      [key, n.current, n.best, n.last_day, n.freeze_used],
    );
    if (key.startsWith("v:")) info = { current: n.current, best: n.best, freezeLeft: freezeOk(n.freeze_used, day) ? 1 : 0 };
  }
  return info;
}

/** 지금 이어지고 있는 연속 (오늘·어제 답했거나, 이틀 전이고 쉬는 날이 남았을 때. 아니면 0) */
export async function currentStreakInfo(visitor: string, day: string): Promise<StreakInfo> {
  const [r] = await query<{ current: number; best: number; last_day: string; freeze_used: string | null }>(
    "SELECT current, best, last_day::text AS last_day, freeze_used::text AS freeze_used FROM quiz_streaks WHERE key = $1",
    [`v:${visitor}`],
  );
  if (!r) return { current: 0, best: 0, freezeLeft: 1 };
  const gap = daysBetween(r.last_day, day);
  const left = freezeOk(r.freeze_used, day) ? 1 : 0;
  const alive = gap <= 1 || (gap === 2 && left === 1);
  return { current: alive ? r.current : 0, best: r.best, freezeLeft: left };
}

export async function currentStreak(visitor: string, day: string): Promise<number> {
  return (await currentStreakInfo(visitor, day)).current;
}

/** 📊 지금 이어지고 있는 연속 참여 분포 (방문자 기준) */
export async function streakDistribution(day: string): Promise<{ d1_2: number; d3_6: number; d7_29: number; d30: number }> {
  const [r] = await query<{ d1_2: number; d3_6: number; d7_29: number; d30: number }>(
    `SELECT count(*) FILTER (WHERE current < 3)::int AS d1_2, count(*) FILTER (WHERE current BETWEEN 3 AND 6)::int AS d3_6,
            count(*) FILTER (WHERE current BETWEEN 7 AND 29)::int AS d7_29, count(*) FILTER (WHERE current >= 30)::int AS d30
       FROM quiz_streaks WHERE key LIKE 'v:%' AND last_day >= $1::date - 1`,
    [day],
  );
  return r ?? { d1_2: 0, d3_6: 0, d7_29: 0, d30: 0 };
}

/** 이 글이 방 오늘의 질문(roompoll)이면 그 날짜 */
export async function roomPollDay(postId: string): Promise<string | null> {
  const [r] = await query<{ seed_key: string }>("SELECT seed_key FROM posts WHERE id = $1", [postId]);
  return r?.seed_key.match(/^roompoll:.+:(\d{4}-\d{2}-\d{2})$/)?.[1] ?? null;
}

export async function seeQuiz(slug: string, day: string, visitor: string): Promise<void> {
  await query("INSERT INTO quiz_impressions (room, day, visitor_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [slug, day, visitor]);
}

/** 운영자: 날짜별로 넣기·고치기 */
export async function putRoomQuiz(room: string, day: string, quiz: unknown, by = "admin"): Promise<void> {
  if (!/^[\p{L}\p{N}-]{1,60}$/u.test(room)) throw new HttpError(400, "invalid_input", "room 을 확인하세요");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "invalid_input", "day 는 YYYY-MM-DD");
  if (QUIZ_EXCLUDED.has(room) || room === SINGLES) throw new HttpError(400, "invalid_input", "이 방은 퀴즈를 올리지 않아요");
  const problem = quizProblem(quiz);
  if (problem) throw new HttpError(400, "invalid_input", problem);
  const q = quiz as RoomQuiz;
  await query(
    `INSERT INTO room_quizzes (room, day, kind, payload, created_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (room, day) DO UPDATE SET kind = EXCLUDED.kind, payload = EXCLUDED.payload, created_by = EXCLUDED.created_by, created_at = now()`,
    [room, day, q.kind, JSON.stringify(q), by],
  );
}

export async function listRoomQuizzes(from: string, to: string): Promise<{ room: string; day: string; kind: string; payload: RoomQuiz }[]> {
  return query("SELECT room, day::text AS day, kind, payload FROM room_quizzes WHERE day BETWEEN $1 AND $2 ORDER BY day, room", [from, to]);
}

export type QuizStatRow = {
  room: string; day: string; visitors: number; impressions: number; answers: number; pollVotes: number; chips: number;
  /** 답한 사람 ÷ 방 방문자, 답한 사람 ÷ 퀴즈 본 사람 (%) */
  rateVisitors: number; rateSeen: number;
};

/** 📊 방·날짜별: 방 방문자(그 날 /c/방 을 연 브라우저), 퀴즈 본 사람, 답한 사람(퀴즈 + 기존 오늘의 질문 투표), 🙌 버튼 답장 */
export async function quizStats(days: number, now = new Date()): Promise<QuizStatRow[]> {
  const n = Math.max(1, Math.min(31, days));
  const rows = await query<{ room: string; day: string; visitors: number; impressions: number; answers: number; poll_votes: number; chips: number }>(
    `WITH d AS (SELECT generate_series(($1::timestamptz AT TIME ZONE 'Asia/Seoul')::date - ($2::int - 1), ($1::timestamptz AT TIME ZONE 'Asia/Seoul')::date, interval '1 day')::date AS day),
     v AS (SELECT category_slug AS room, day, count(DISTINCT visitor_hash)::int AS n FROM page_views
            WHERE category_slug IS NOT NULL AND day IN (SELECT day FROM d) GROUP BY 1, 2),
     i AS (SELECT room, day, count(*)::int AS n FROM quiz_impressions WHERE day IN (SELECT day FROM d) GROUP BY 1, 2),
     a AS (SELECT room, day, count(*)::int AS n FROM quiz_answers WHERE day IN (SELECT day FROM d) GROUP BY 1, 2),
     pv AS (SELECT split_part(p.seed_key, ':', 2) AS room, split_part(p.seed_key, ':', 3)::date AS day, count(*)::int AS n
              FROM debate_votes dv JOIN posts p ON p.id = dv.post_id
             WHERE p.seed_key LIKE 'roompoll:%' AND split_part(p.seed_key, ':', 3) ~ '^\\d{4}-\\d{2}-\\d{2}$'
               AND split_part(p.seed_key, ':', 3)::date IN (SELECT day FROM d) GROUP BY 1, 2),
     ch AS (SELECT c.slug AS room, (cm.created_at AT TIME ZONE 'Asia/Seoul')::date AS day, count(*)::int AS n
              FROM comments cm JOIN posts p ON p.id = cm.post_id JOIN categories c ON c.id = p.category_id
             WHERE cm.via_chip AND (cm.created_at AT TIME ZONE 'Asia/Seoul')::date IN (SELECT day FROM d) GROUP BY 1, 2),
     keys AS (SELECT room, day FROM v UNION SELECT room, day FROM i UNION SELECT room, day FROM a UNION SELECT room, day FROM pv UNION SELECT room, day FROM ch)
     SELECT k.room, k.day::text AS day, coalesce(v.n, 0) AS visitors, coalesce(i.n, 0) AS impressions, coalesce(a.n, 0) AS answers,
            coalesce(pv.n, 0) AS poll_votes, coalesce(ch.n, 0) AS chips
       FROM keys k LEFT JOIN v USING (room, day) LEFT JOIN i USING (room, day) LEFT JOIN a USING (room, day)
            LEFT JOIN pv USING (room, day) LEFT JOIN ch USING (room, day)
      ORDER BY k.day DESC, coalesce(v.n, 0) DESC`,
    [now.toISOString(), n],
  );
  return rows.map((r) => {
    const answered = r.answers + r.poll_votes;
    return {
      room: r.room, day: r.day, visitors: r.visitors, impressions: r.impressions, answers: r.answers, pollVotes: r.poll_votes, chips: r.chips,
      rateVisitors: Math.min(100, pct(answered, r.visitors)), rateSeen: Math.min(100, pct(answered, r.impressions)),
    };
  });
}

/** 답한 뒤 "다른 방 퀴즈도 풀기": 오늘 아직 답하지 않은 다른 방 하나 (숨은 방·퀴즈 없는 방 빼고) */
export async function nextQuizRoom(visitor: string, day: string, current: string): Promise<{ slug: string; name: string } | null> {
  const skip = [...QUIZ_EXCLUDED, SINGLES, current];
  const [r] = await query<{ slug: string; name: string }>(
    `SELECT c.slug, c.name FROM categories c
      WHERE NOT c.is_hidden AND NOT c.info_only AND c.slug <> ALL($3::text[])
        AND NOT EXISTS (SELECT 1 FROM quiz_answers a WHERE a.room = c.slug AND a.day = $2 AND a.visitor_hash = $1)
        AND NOT EXISTS (SELECT 1 FROM posts p JOIN debate_votes v ON v.post_id = p.id
                         WHERE p.seed_key = 'roompoll:' || c.slug || ':' || $2 AND v.visitor_hash = $1)
      ORDER BY random() LIMIT 1`,
    [visitor, day, skip],
  );
  return r ?? null;
}
