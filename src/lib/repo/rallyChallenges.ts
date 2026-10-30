/** 🎾 랠리 도전장 저장소 (10/30). 규칙은 src/lib/rallyChallenge.ts */
import { query } from "../db";
import { kstDay } from "../metrics";
import { beats, cleanName, isChallengeId, newChallengeId } from "../rallyChallenge";

export type Challenge = { id: string; score: number; name: string; seed: number; tries: number; wins: number };

/** 도전장 만들기. parent = 받은 도전장에 되갚는 도전장이면 그 id */
export async function createChallenge(input: { visitor: string; score: number; seed: number; name?: string | null; parent?: string | null }): Promise<Challenge> {
  const parent = isChallengeId(input.parent) ? input.parent : null;
  for (let i = 0; i < 5; i++) {
    const id = newChallengeId();
    const rows = await query<{ id: string }>(
      `INSERT INTO rally_challenges (id, score, name, seed, visitor_hash, parent_id) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, input.score, cleanName(input.name), input.seed, input.visitor, parent],
    );
    if (rows.length) return { id, score: input.score, name: cleanName(input.name), seed: input.seed, tries: 0, wins: 0 };
  }
  throw new Error("challenge id collision");
}

/** 도전장 + 지금까지 도전한 사람 수·성공한 사람 수 (이름은 내보내지 않는다) */
export async function getChallenge(id: string): Promise<Challenge | null> {
  if (!isChallengeId(id)) return null;
  const [r] = await query<{ id: string; score: number; name: string; seed: number; tries: number; wins: number }>(
    `SELECT c.id, c.score, c.name, c.seed,
            (SELECT count(DISTINCT visitor_hash) FROM rally_attempts a WHERE a.challenge_id = c.id)::int AS tries,
            (SELECT count(DISTINCT visitor_hash) FROM rally_attempts a WHERE a.challenge_id = c.id AND a.beat)::int AS wins
       FROM rally_challenges c WHERE c.id = $1`,
    [id],
  );
  return r ? { id: r.id, score: Number(r.score), name: r.name, seed: Number(r.seed), tries: Number(r.tries), wins: Number(r.wins) } : null;
}

export type AttemptResult = { beat: boolean; target: number; challenge: Challenge };

/** 도전 한 판 기록. 같은 사람이 여러 번 해도 사람 수는 한 번만 센다 */
export async function recordAttempt(id: string, visitor: string, score: number): Promise<AttemptResult | null> {
  const c = await getChallenge(id);
  if (!c) return null;
  const beat = beats(score, c.score);
  await query("INSERT INTO rally_attempts (challenge_id, visitor_hash, score, beat) VALUES ($1, $2, $3, $4)", [id, visitor, score, beat]);
  return { beat, target: c.score, challenge: (await getChallenge(id))! };
}

export type ChallengeStat = { created: number; opens: number; newVisitors: number; attempts: number; challengers: number; wins: number };

/** 관리자 🎮: 기간 안 도전장 만든 수 · 도전장 링크로 연 수 · 그중 그날 처음 온 사람 · 도전 판 수 · 도전한 사람 · 이긴 판 */
export async function challengeStats(days = 7, now = new Date()): Promise<ChallengeStat> {
  const from = kstDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  const [r] = await query<ChallengeStat>(
    `SELECT (SELECT count(*) FROM rally_challenges WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date >= $1::date)::int AS created,
            (SELECT count(*) FROM game_opens WHERE game = 'rally' AND src = 'challenge' AND day >= $1::date)::int AS opens,
            (SELECT count(DISTINCT o.visitor_hash) FROM game_opens o JOIN visitors v ON v.visitor_hash = o.visitor_hash
              WHERE o.game = 'rally' AND o.src = 'challenge' AND o.day >= $1::date
                AND (v.first_seen AT TIME ZONE 'Asia/Seoul')::date = o.day)::int AS "newVisitors",
            (SELECT count(*) FROM rally_attempts WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date >= $1::date)::int AS attempts,
            (SELECT count(DISTINCT visitor_hash) FROM rally_attempts WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date >= $1::date)::int AS challengers,
            (SELECT count(*) FROM rally_attempts WHERE beat AND (created_at AT TIME ZONE 'Asia/Seoul')::date >= $1::date)::int AS wins`,
    [from],
  );
  return {
    created: Number(r?.created ?? 0),
    opens: Number(r?.opens ?? 0),
    newVisitors: Number(r?.newVisitors ?? 0),
    attempts: Number(r?.attempts ?? 0),
    challengers: Number(r?.challengers ?? 0),
    wins: Number(r?.wins ?? 0),
  };
}
