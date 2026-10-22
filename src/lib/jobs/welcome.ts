import { randomInt } from "node:crypto";
import { pool } from "../db";
import { reportError } from "../error-tracking";
import { createComment } from "../repo/comments";
import { OPERATOR_NICKS } from "../repo/metrics";
import { TEST_POST_IDS } from "../testPosts";
import { findPeer, type Peer } from "../peers";

const LOCK_KEY = 4_823_092;
const MAX_PER_RUN = 5;
/** 환영 답글을 번갈아 다는 운영 닉네임 (10/22) */
export const WELCOME_NAMES = ["노방장", "돈키호테", "덕후1호"] as const;

type First = { id: string; post_id: string; nickname: string; slug: string; chat: boolean; body: string; fp: string };

const pick = <T,>(xs: readonly T[], v: number): T => xs[((v % xs.length) + xs.length) % xs.length]!;

/** 테스트 결과 댓글에서 타입만 뽑기: "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: …" → "🚌 원정 직관러" */
export function resultType(body: string): string | null {
  const m = /테스트[^:]*:\s*([^/\n]{1,30})/.exec(body);
  return m ? m[1]!.trim() : null;
}

/**
 * 첫 댓글에 붙일 환영 한 줄 — 짧게, 다음에 할 일 하나만. 같은 팀·타입인 사람이 있으면 그 사람을 불러 잇는다 (Sprint 94).
 * 같은 문장이 줄줄이 붙으면 기계 같아서, 표현을 여러 개 두고 댓글마다 돌려 쓴다 (v).
 */
export function welcomeText(c: Pick<First, "nickname" | "post_id" | "chat"> & { body?: string }, peer?: Peer | null, v = 0): string {
  const n = c.nickname;
  if (c.chat) return pick([`${n}님 어서 와요! 👋 편하게 아무 얘기나 해요.`, `${n}님 왔다 👋 오늘 뭐 하고 지냈어요?`, `오 ${n}님 반가워요 ㅎㅎ 자주 놀러 와요.`], v);
  if (peer?.why === "team")
    return pick(
      [
        `${n}님 반가워요! 👋 @${peer.nickname}님도 ${peer.label} 팬이에요. 두 분 올 시즌 제일 기억에 남는 경기 하나씩 나눠 보실래요?`,
        `@${peer.nickname}님, ${peer.label} 팬 한 분 더 오셨어요 ⚡ ${n}님은 주로 직관이세요, 중계세요?`,
        `${n}님 ${peer.label}! 위에 @${peer.nickname}님도 같은 팀이에요. 요즘 제일 좋아하는 선수 한 명씩 꼽아 보면 재밌겠네요.`,
      ],
      v,
    );
  if (peer)
    return pick(
      [
        `${n}님 반가워요! 👋 @${peer.nickname}님도 같은 ${peer.label}예요. 서로 어떤 점이 비슷한지 이야기 나눠 보실래요?`,
        `오 ${peer.label} 또 나왔다 ㅎㅎ @${peer.nickname}님이랑 같은 타입이에요. ${n}님은 결과 맞는 것 같아요?`,
        `${n}님이랑 @${peer.nickname}님 둘 다 ${peer.label}! 두 분 공통점 찾아보세요 👀`,
      ],
      v,
    );
  if (TEST_POST_IDS.has(c.post_id)) {
    const t = c.body ? resultType(c.body) : null;
    if (t)
      return pick(
        [
          `${n}님은 ${t}이군요 ㅎㅎ 결과 맞는 것 같아요?`,
          `${t} 나왔네요! ${n}님 실제로도 그런 편이에요?`,
          `오 ${n}님 ${t} 👀 친구도 해 보면 뭐 나올지 궁금하네요.`,
          `${n}님 결과 잘 봤어요. ${t}, 어느 부분이 제일 공감돼요?`,
        ],
        v,
      );
    return pick([`${n}님 반가워요! 👋 위에 다른 분들 결과도 구경해 보세요. 같은 타입 있을지도요.`, `${n}님 결과 고마워요 🙌 다른 분들이랑 비교해 보면 재밌어요.`], v);
  }
  return pick([`${n}님 반가워요! 👋 첫 댓글 고마워요. 💬 수다방에도 편하게 놀러 와요.`, `${n}님 첫 댓글 반가워요 🙌 다른 글도 편하게 구경해요.`, `와 ${n}님 어서 와요 ㅎㅎ 자주 와 주세요.`], v);
}

/**
 * 첫 댓글 환영 (Sprint 92). 10/22 사용자: 4명 중 1명 → 다시 모두에게(every=1), 운영 닉네임 셋을 번갈아 가며. 표현은 여러 개를 돌려 쓴다. 처음 댓글을 남긴 사람(브라우저)에게 1분쯤 뒤 운영 계정 이름으로 답글 하나.
 * 첫 반응이 빨리 와야 다시 온다. 이미 운영 계정이 답했거나, 가려졌거나, 30분 넘게 지난 댓글은 건너뛴다.
 */
export async function runWelcome(now = new Date(), every = 1): Promise<number> {
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
            AND c.id % $4 = 0
          ORDER BY c.id LIMIT $3`,
        [now.toISOString(), OPERATOR_NICKS, MAX_PER_RUN, every],
      );
      let n = 0;
      for (const c of rows) {
        const nickname = WELCOME_NAMES[Number(c.id) % WELCOME_NAMES.length]!;
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
        await createComment(c.post_id, { nickname, pin: String(randomInt(1000, 10000)), body: welcomeText(c, peer, Math.floor(Number(c.id) / every)), parentId: c.id });
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
