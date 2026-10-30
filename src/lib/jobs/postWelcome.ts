import { randomInt } from "node:crypto";
import { pool } from "../db";
import { guardJob } from "./guard";
import { createComment } from "../repo/comments";
import { OPERATOR_NICKS } from "../repo/metrics";
import { AI_OPS_NICKS } from "../aiMark";

const LOCK_KEY = 4_823_093;
const MAX_PER_RUN = 10;
/**
 * ✍️ 사람이 글을 쓰면 20초~1분 사이에 운영 이름으로 반가운 댓글 하나 (10/30 운영 이름 17개 랜덤) (10/30 "20초는 너무 짧고 20초~1분 사이에", "한번 다는데 닉네임을 번갈아") (10/30 대표님 "어떤 사람이 글을 쓰면 무조건 내 이름으로 댓글을
 * 달아줘. 20초 안에. 환영해요, 반갑습니다 등등 돌아가면서" + "동탄맨, 울트라매니아 번갈아가면서").
 * 새 글은 글에 댓글로, 댓글·수다방 말은 그 말에 답글로(한 글에서 한 사람에게 한 번). 시스템이 만든 글(seed_key) 자체에는 달지 않는다. POST_WELCOME_ENABLED=0 이면 끈다.
 */
// 10/30 대표님 "18개로 랜덤 번갈아가며": 운영 이름 전부 ("💬 수다방"은 사람 이름이 아니라 뺐다)
/** 대표님이 휴대폰에서 쓰는 이름: 환영 답글을 달지 않는다 (10/30 "내가 다는 댓글에는 댓글 달지마", "밑에는 내가 쓴거니까") */
export const OWNER_NICKS = ["김하연작가"];
// 🤖 표시가 붙는 AI 이름(노방장·돈키호테·덕후1호)은 빼고 (10/30 "노방장은 ai표시 로봇 표시가 붙는거잖아")
export const POST_WELCOME_NAMES = OPERATOR_NICKS.filter((n) => n !== "💬 수다방" && !AI_OPS_NICKS.has(n));
/** 글에 AI 이름으로만 답한 적이 있으면 이 이름으로 이어서 (10/30 "댓글은 노방장쓰지말고 울트라매니아로 해") */
export const AI_REPLACEMENT_NAME = "울트라매니아";

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

/**
 * 이름은 글마다 하나로 고정 (10/30 대표님 "가급적 하나의 닉네임으로"): 같은 글에 달리는 환영 답글은 늘 같은 이름,
 * 글이 바뀌면 17개 중 다른 이름(글 번호를 섞어 고른다). 문장은 댓글·글 번호로 돌린다.
 */
export function postWelcome(postId: string, nickname: string, lineId: string = postId): { who: string; body: string } {
  const id = Number(postId) || 0;
  const who = POST_WELCOME_NAMES[Math.floor(Math.abs(Math.sin(id + 1) * 10_000)) % POST_WELCOME_NAMES.length]!;
  const line = LINES[(Number(lineId) || 0) % LINES.length]!;
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
          WHERE p.created_at <= $1::timestamptz - make_interval(secs => 20 + (p.id % 41)) AND p.created_at > $1::timestamptz - interval '10 minutes'
            AND NOT p.is_ai_curated AND p.author_fingerprint IS NOT NULL AND p.ai_hidden_at IS NULL AND NOT p.is_blinded
            AND p.seed_key IS NULL
            AND p.nickname <> ALL($2::text[])
            AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.nickname = ANY($3::text[]))
          ORDER BY p.id LIMIT $4`,
        [now.toISOString(), [...OPERATOR_NICKS, ...OWNER_NICKS], POST_WELCOME_NAMES, MAX_PER_RUN],
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
          WHERE c.created_at <= $1::timestamptz - make_interval(secs => 20 + (c.id % 41)) AND c.created_at > $1::timestamptz - interval '10 minutes'
            AND NOT c.is_ai_curated AND c.author_fingerprint IS NOT NULL AND c.ai_hidden_at IS NULL AND NOT p.is_blinded
            AND c.nickname <> ALL($2::text[])
            AND NOT EXISTS (
              SELECT 1 FROM comments r JOIN comments mine ON mine.id = r.parent_id
               WHERE r.post_id = c.post_id AND r.nickname = ANY($3::text[]) AND mine.author_fingerprint = c.author_fingerprint)
            AND NOT EXISTS (SELECT 1 FROM comments e WHERE e.post_id = c.post_id AND e.author_fingerprint = c.author_fingerprint AND e.id > c.id)
            -- 글쓴이가 자기 글에 댓글을 달면, 글에 이미 환영 댓글이 달렸으면 또 달지 않는다 (한 사람에게 한 번)
            AND NOT (p.author_fingerprint = c.author_fingerprint AND EXISTS (SELECT 1 FROM comments w WHERE w.post_id = c.post_id AND w.parent_id IS NULL AND w.nickname = ANY($3::text[])))
          ORDER BY c.id LIMIT $4`,
        [now.toISOString(), [...OPERATOR_NICKS, ...OWNER_NICKS], POST_WELCOME_NAMES, MAX_PER_RUN],
      );
      for (const c of cs) {
        let { who, body } = postWelcome(c.post_id, c.nickname, c.id);
        // 이미 이 글에 운영 이름으로 답한 적이 있으면 그 이름을 그대로 (10/30 "한번 답글을 달기 시작할때는 같은 닉네임으로")
        // 가장 최근에 답한 운영 이름을 잇는다. 그게 🤖 AI 이름이면 울트라매니아로
        const { rows: last } = await client.query<{ nickname: string }>(
          "SELECT nickname FROM comments WHERE post_id = $1 AND nickname = ANY($2::text[]) ORDER BY id DESC LIMIT 1",
          [c.post_id, [...POST_WELCOME_NAMES, ...AI_OPS_NICKS]],
        );
        if (last[0]) who = AI_OPS_NICKS.has(last[0].nickname) ? AI_REPLACEMENT_NAME : last[0].nickname;
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

/** 10초마다 확인 → 글마다 20초~1분 사이(글 번호로 정한 대기 + 확인 간격)에 댓글 */
export function startPostWelcomeScheduler(intervalMs = 10_000): () => void {
  const tick = guardJob("post-welcome", runPostWelcome);
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
