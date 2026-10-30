import { randomInt } from "node:crypto";
import { pool } from "../db";
import { guardJob } from "./guard";
import { createComment } from "../repo/comments";
import { OPERATOR_NICKS } from "../repo/metrics";

const LOCK_KEY = 4_823_093;
const MAX_PER_RUN = 10;
/**
 * ✍️ 사람이 새 글을 쓰면 20초 안에 운영 이름으로 반가운 댓글 하나 (10/30 대표님 "어떤 사람이 글을 쓰면 무조건 내 이름으로 댓글을
 * 달아줘. 20초 안에. 환영해요, 반갑습니다 등등 돌아가면서" + "동탄맨, 울트라매니아 번갈아가면서").
 * 새 글은 글에 댓글로, 댓글·수다방 말은 그 말에 답글로(한 글에서 한 사람에게 한 번). 시스템이 만든 글(seed_key) 자체에는 달지 않는다. POST_WELCOME_ENABLED=0 이면 끈다.
 */
export const POST_WELCOME_NAMES = ["동탄맨", "울트라매니아"] as const;

const LINES = [
  (n: string) => `${n}님 환영해요`,
  (n: string) => `반갑습니다 ${n}님`,
  (n: string) => `${n}님 글 잘 봤어요`,
  () => "환영합니다 ^^",
  (n: string) => `${n}님 어서 오세요`,
  () => "반가워요 ㅎㅎ",
  (n: string) => `${n}님 글 고마워요`,
  () => "좋은 글 감사해요",
] as const;

/** 글 번호로 이름과 문장을 돌린다 (이름 순번과 문장 순번을 따로 세서 같은 이름이 늘 같은 말을 하지 않게) */
export function postWelcome(postId: string, nickname: string): { who: string; body: string } {
  const id = Number(postId) || 0;
  const who = POST_WELCOME_NAMES[id % POST_WELCOME_NAMES.length]!;
  const line = LINES[Math.floor(id / POST_WELCOME_NAMES.length) % LINES.length]!;
  return { who, body: line(nickname) };
}

type Fresh = { id: string; nickname: string };

export async function runPostWelcome(now = new Date()): Promise<number> {
  if (process.env.POST_WELCOME_ENABLED === "0") return 0;
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return 0;
    try {
      const { rows } = await client.query<Fresh>(
        `SELECT p.id::text, p.nickname
           FROM posts p
          WHERE p.created_at <= $1::timestamptz - interval '3 seconds' AND p.created_at > $1::timestamptz - interval '10 minutes'
            AND NOT p.is_ai_curated AND p.author_fingerprint IS NOT NULL AND p.ai_hidden_at IS NULL AND NOT p.is_blinded
            AND p.seed_key IS NULL
            AND p.nickname <> ALL($2::text[])
            AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.nickname = ANY($3::text[]))
          ORDER BY p.id LIMIT $4`,
        [now.toISOString(), OPERATOR_NICKS, POST_WELCOME_NAMES, MAX_PER_RUN],
      );
      let n = 0;
      for (const p of rows) {
        const { who, body } = postWelcome(p.id, p.nickname);
        await createComment(p.id, { nickname: who, pin: String(randomInt(1000, 10000)), body });
        n++;
      }
      // 댓글·수다방 말에도 (10/30 대표님 "오늘 사람이 쓴 글에 전부 ... 답글"): 한 글에서 한 사람에게 한 번만 답글로.
      // 그 사람이 운영 답글에 다시 답해도 또 달지 않아 끝없이 주고받지 않는다
      const { rows: cs } = await client.query<{ id: string; post_id: string; nickname: string }>(
        `SELECT c.id::text, c.post_id::text, c.nickname
           FROM comments c JOIN posts p ON p.id = c.post_id
          WHERE c.created_at <= $1::timestamptz - interval '3 seconds' AND c.created_at > $1::timestamptz - interval '10 minutes'
            AND NOT c.is_ai_curated AND c.author_fingerprint IS NOT NULL AND c.ai_hidden_at IS NULL AND NOT p.is_blinded
            AND c.nickname <> ALL($2::text[])
            AND NOT EXISTS (
              SELECT 1 FROM comments r JOIN comments mine ON mine.id = r.parent_id
               WHERE r.post_id = c.post_id AND r.nickname = ANY($3::text[]) AND mine.author_fingerprint = c.author_fingerprint)
            AND NOT EXISTS (SELECT 1 FROM comments e WHERE e.post_id = c.post_id AND e.author_fingerprint = c.author_fingerprint AND e.id > c.id)
          ORDER BY c.id LIMIT $4`,
        [now.toISOString(), OPERATOR_NICKS, POST_WELCOME_NAMES, MAX_PER_RUN],
      );
      for (const c of cs) {
        const { who, body } = postWelcome(c.id, c.nickname);
        await createComment(c.post_id, { nickname: who, pin: String(randomInt(1000, 10000)), body, parentId: c.id });
        n++;
      }
      return n;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** 10초마다 확인 → 글이 올라오고 늦어도 20초 안에 댓글 */
export function startPostWelcomeScheduler(intervalMs = 10_000): () => void {
  const tick = guardJob("post-welcome", runPostWelcome);
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
