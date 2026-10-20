import { randomInt } from "node:crypto";
import { pool } from "../db";
import { reportError } from "../error-tracking";
import { createComment } from "../repo/comments";
import { OPERATOR_NICKS } from "../repo/metrics";
import { TEST_POST_IDS } from "../testPosts";
import { OPERATOR_NAMES } from "./operatorLikes";
import { BOOK_ROOM_SLUG } from "../books";
import { findPeer, type Peer } from "../peers";

const LOCK_KEY = 4_823_092;
const MAX_PER_RUN = 5;

type First = { id: string; post_id: string; nickname: string; slug: string; chat: boolean; body: string; fp: string };

/** 첫 댓글에 붙일 환영 한 줄 — 짧게, 다음에 할 일 하나만. 같은 팀·타입인 사람이 있으면 그 사람을 불러 잇는다 (Sprint 94) */
export function welcomeText(c: Pick<First, "nickname" | "post_id" | "chat">, peer?: Peer | null): string {
  if (c.chat) return `${c.nickname}님 어서 와요! 👋 편하게 아무 얘기나 해요.`;
  if (peer?.why === "team") return `${c.nickname}님 반가워요! 👋 @${peer.nickname}님도 ${peer.label} 팬이에요. 두 분 올 시즌 제일 기억에 남는 경기 하나씩 나눠 보실래요?`;
  if (peer) return `${c.nickname}님 반가워요! 👋 @${peer.nickname}님도 같은 ${peer.label}예요. 서로 어떤 점이 비슷한지 이야기 나눠 보실래요?`;
  if (TEST_POST_IDS.has(c.post_id)) return `${c.nickname}님 반가워요! 👋 위에 다른 분들 결과도 구경해 보세요. 같은 타입 있을지도요.`;
  return `${c.nickname}님 반가워요! 👋 첫 댓글 고마워요. 💬 수다방에도 편하게 놀러 와요.`;
}

/**
 * 첫 댓글 환영 (Sprint 92). 처음 댓글을 남긴 사람(브라우저)에게 1분쯤 뒤 운영 계정 이름으로 답글 하나.
 * 첫 반응이 빨리 와야 다시 온다. 이미 운영 계정이 답했거나, 가려졌거나, 30분 넘게 지난 댓글은 건너뛴다.
 */
export async function runWelcome(now = new Date()): Promise<number> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return 0;
    try {
      const { rows } = await client.query<First>(
        `SELECT c.id::text, c.post_id::text, c.nickname, c.body, c.author_fingerprint AS fp, cat.slug, COALESCE(p.seed_key LIKE 'roomchat:%', false) AS chat
           FROM comments c JOIN posts p ON p.id = c.post_id JOIN categories cat ON cat.id = p.category_id
          WHERE c.created_at <= $1::timestamptz - interval '1 minute' AND c.created_at > $1::timestamptz - interval '30 minutes'
            AND NOT c.is_ai_curated AND c.author_fingerprint IS NOT NULL AND c.ai_hidden_at IS NULL AND NOT p.is_blinded
            AND c.nickname <> ALL($2::text[])
            AND NOT EXISTS (SELECT 1 FROM comments e WHERE e.author_fingerprint = c.author_fingerprint AND e.id < c.id)
            AND NOT EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id AND r.nickname = ANY($2::text[]))
          ORDER BY c.id LIMIT $3`,
        [now.toISOString(), OPERATOR_NICKS, MAX_PER_RUN],
      );
      let n = 0;
      for (const c of rows) {
        const nickname = c.slug === BOOK_ROOM_SLUG ? OPERATOR_NAMES[BOOK_ROOM_SLUG] : OPERATOR_NAMES.default;
        let peer: Peer | null = null;
        if (TEST_POST_IDS.has(c.post_id)) {
          // 같은 글에 최근 7일 안에 결과를 남긴 다른 사람 (최근 것부터)
          const { rows: earlier } = await client.query<{ nickname: string; body: string }>(
            `SELECT nickname, body FROM comments
              WHERE post_id = $1 AND id < $2 AND parent_id IS NULL AND NOT is_ai_curated AND ai_hidden_at IS NULL
                AND author_fingerprint IS NOT NULL AND author_fingerprint <> $3 AND nickname <> ALL($4::text[])
                AND created_at > $5::timestamptz - interval '7 days'
              ORDER BY id DESC LIMIT 300`,
            [c.post_id, c.id, c.fp, OPERATOR_NICKS, now.toISOString()],
          );
          peer = findPeer(c.body, c.nickname, earlier);
        }
        await createComment(c.post_id, { nickname, pin: String(randomInt(1000, 10000)), body: welcomeText(c, peer), parentId: c.id });
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

export function startWelcomeScheduler(intervalMs = 60_000): () => void {
  const tick = () =>
    runWelcome().catch((err) => {
      console.error("[welcome] failed:", (err as Error).message);
      reportError(err, { kind: "job", where: "welcome" });
    });
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
