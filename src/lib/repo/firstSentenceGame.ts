/** 📖 첫 문장 맞히기 저장소 (11/4). 규칙·문제는 src/lib/firstSentenceGame.ts. 기록은 game_plays(game='booksent') 한 줄 = 그날 랭킹에 들어간 한 판 */
import { query } from "../db";
import { encodeScore, gradeAnswers, MAX_MS, MIN_MS } from "../firstSentenceGame";
import { kstDay } from "../metrics";
import { GAMES } from "../miniGames";

const GAME = "booksent";

/** 오늘(KST) 이 사람이 랭킹에 남긴 기록 (없으면 null) */
export async function todayPlay(visitor: string | null, now = new Date()): Promise<number | null> {
  if (!visitor) return null;
  const [r] = await query<{ score: number }>("SELECT score FROM game_plays WHERE game = $1 AND visitor_hash = $2 AND day = $3 ORDER BY created_at LIMIT 1", [GAME, visitor, kstDay(now)]);
  return r ? Number(r.score) : null;
}

export type SentenceResult = { correct: number; score: number; ranked: boolean; answers: { id: string; title: string; author: string; ok: boolean }[] };

/**
 * 채점하고, 오늘 첫 판이면 랭킹에 남긴다 (다시 하기는 채점만, 저장하지 않음).
 * 같은 사람이 동시에 두 번 보내도 한 줄만 남도록 INSERT … WHERE NOT EXISTS.
 */
export async function playSentenceGame(visitor: string, picks: readonly (string | null)[], ms: number, nickname: string | null, now = new Date()): Promise<SentenceResult> {
  const day = kstDay(now);
  const { correct, answers } = gradeAnswers(day, picks);
  const score = encodeScore(correct, Math.min(MAX_MS, Math.max(MIN_MS, Math.round(ms))));
  const rows = await query<{ id: string }>(
    `INSERT INTO game_plays (game, room, visitor_hash, score, day, nickname)
     SELECT $1::varchar, $2::varchar, $3::text, $4::int, $5::date, $6::varchar
      WHERE NOT EXISTS (SELECT 1 FROM game_plays WHERE game = $1::varchar AND visitor_hash = $3::text AND day = $5::date)
     RETURNING id::text`,
    [GAME, GAMES.booksent.room, visitor, score, day, nickname],
  );
  return { correct, score, ranked: rows.length > 0, answers };
}
