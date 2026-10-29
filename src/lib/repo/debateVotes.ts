/** ⚖️ AI 토론·📚 오늘의 책 질문 사람 투표 (Sprint 74·76). AI 쪽 숫자는 그날 페르소나 의견 댓글의 [편] 머리말로 센다. */
import { bookPollTopic } from "../bookPoll";
import { debateTopic } from "../debate";
import { roomPollTopic } from "../roomPolls";
import { query } from "../db";
import { notFound } from "../errors";
import { isGenderSplitRoom, type GenderTally, type VoteGender } from "../genderSplit";

export type DebateSide = "A" | "B";
export type DebateTally = {
  a: string;
  b: string;
  human: { A: number; B: number };
  ai: { A: number; B: number };
  /** 👫 남녀를 나눠 세는 방(미혼남녀방)의 투표만: 남/여를 고른 사람의 표 (10/29) */
  gender?: GenderTally;
};

async function topicOf(postId: string): Promise<[string, string, string?]> {
  if (!/^\d{1,18}$/.test(postId)) throw notFound();
  const [row] = await query<{ seed_key: string }>(
    "SELECT seed_key FROM posts WHERE id = $1 AND (seed_key LIKE 'debate:%' OR seed_key LIKE 'bookpoll:%' OR seed_key LIKE 'roompoll:%')",
    [postId],
  );
  // 🗳 방마다 오늘의 질문 (Sprint 83)
  const r = row?.seed_key.match(/^roompoll:(.+):(\d{4}-\d{2}-\d{2})$/);
  if (r) {
    const topic = roomPollTopic(r[1]!, r[2]!);
    if (topic) return [topic[0], topic[1], r[1]!];
  }
  const m = row?.seed_key.match(/^(debate|bookpoll):(\d{4}-\d{2}-\d{2})$/);
  if (!m) throw notFound("토론");
  // 📚 오늘의 책 질문(Sprint 76)도 같은 투표를 쓴다
  return m[1] === "bookpoll" ? bookPollTopic(m[2]!) : debateTopic(m[2]!);
}

export async function isDebatePost(postId: string): Promise<boolean> {
  return topicOf(postId).then(() => true, () => false);
}

export async function debateTally(postId: string): Promise<DebateTally> {
  const [a, b, room] = await topicOf(postId);
  const [h] = await query<{ a: number; b: number; ma: number; mb: number; fa: number; fb: number }>(
    `SELECT count(*) FILTER (WHERE side = 'A')::int AS a, count(*) FILTER (WHERE side = 'B')::int AS b,
            count(*) FILTER (WHERE side = 'A' AND gender = 'm')::int AS ma, count(*) FILTER (WHERE side = 'B' AND gender = 'm')::int AS mb,
            count(*) FILTER (WHERE side = 'A' AND gender = 'f')::int AS fa, count(*) FILTER (WHERE side = 'B' AND gender = 'f')::int AS fb
       FROM debate_votes WHERE post_id = $1`,
    [postId],
  );
  const [ai] = await query<{ a: number; b: number }>(
    `SELECT count(*) FILTER (WHERE body LIKE $2)::int AS a, count(*) FILTER (WHERE body LIKE $3)::int AS b
       FROM comments WHERE post_id = $1 AND parent_id IS NULL AND is_ai_curated`,
    [postId, `[${a}]%`, `[${b}]%`],
  );
  const gender = isGenderSplitRoom(room) ? { m: { A: h!.ma, B: h!.mb }, f: { A: h!.fa, B: h!.fb } } : undefined;
  return { a, b, human: { A: h!.a, B: h!.b }, ai: { A: ai!.a, B: ai!.b }, ...(gender ? { gender } : {}) };
}

export async function voteDebate(postId: string, visitorHash: string, side: DebateSide, gender?: VoteGender | null): Promise<DebateTally> {
  const [, , room] = await topicOf(postId);
  // 남녀는 나눠 세는 방에서만 남긴다. 고르지 않고 다시 투표하면 예전에 고른 값을 그대로 둔다
  const g = isGenderSplitRoom(room) ? (gender ?? null) : null;
  await query(
    `INSERT INTO debate_votes (post_id, visitor_hash, side, gender) VALUES ($1, $2, $3, $4)
     ON CONFLICT (post_id, visitor_hash) DO UPDATE SET side = EXCLUDED.side, gender = COALESCE(EXCLUDED.gender, debate_votes.gender)`,
    [postId, visitorHash, side, g],
  );
  return debateTally(postId);
}

/** 이 방의 가장 최근 🗳 오늘의 질문 글 (Sprint 83, 방 맨 위) */
export async function latestRoomPoll(slug: string): Promise<{ id: string; title: string } | null> {
  const [row] = await query<{ id: string; title: string }>(
    "SELECT id::text, title FROM posts WHERE seed_key LIKE $1 AND NOT is_blinded ORDER BY created_at DESC LIMIT 1",
    [`roompoll:${slug.replace(/[%_\\]/g, "")}:%`],
  );
  return row ?? null;
}

/** 가장 최근 📚 오늘의 책 질문 글 (홈 맨 위) */
export async function latestBookPoll(): Promise<{ id: string; title: string } | null> {
  const [row] = await query<{ id: string; title: string }>(
    "SELECT id::text, title FROM posts WHERE seed_key LIKE 'bookpoll:%' AND NOT is_blinded ORDER BY created_at DESC LIMIT 1",
  );
  return row ?? null;
}

/** 👫 이 방의 최근 오늘의 질문 글들 (남녀 생각 차이 탭, 최신순) */
export async function recentRoomPolls(slug: string, limit = 14): Promise<{ id: string; title: string; tally: DebateTally }[]> {
  const rows = await query<{ id: string; title: string }>(
    "SELECT id::text, title FROM posts WHERE seed_key LIKE $1 AND NOT is_blinded ORDER BY created_at DESC LIMIT $2",
    [`roompoll:${slug.replace(/[%_\\]/g, "")}:%`, limit],
  );
  return Promise.all(rows.map(async (r) => ({ ...r, tally: await debateTally(r.id) })));
}
