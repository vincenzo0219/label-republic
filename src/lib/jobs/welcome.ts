import { randomInt } from "node:crypto";
import { pool } from "../db";
import { guardJob } from "./guard";
import { createComment } from "../repo/comments";
import { OPERATOR_NICKS } from "../repo/metrics";
import { TEST_POST_IDS } from "../testPosts";
import type { Peer } from "../peers";

const LOCK_KEY = 4_823_092;
const MAX_PER_RUN = 5;
/** 자동 환영 답글: 10/25 대표님 지시로 기본 꺼짐. 대표님 허락 뒤에만 WELCOME_REPLIES=1 로 켠다 */
const welcomeOn = () => process.env.WELCOME_REPLIES === "1";
/** 환영 답글을 번갈아 다는 운영 닉네임 (10/22) */
export const WELCOME_NAMES = ["노방장", "돈키호테", "덕후1호"] as const;

type First = { id: string; post_id: string; nickname: string; slug: string; chat: boolean; body: string; fp: string };

const pick = <T,>(xs: readonly T[], v: number): T => xs[((v % xs.length) + xs.length) % xs.length]!;

/** 테스트 결과 댓글에서 타입만 뽑기: "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: …" → "🚌 원정 직관러" */
export function resultType(body: string): string | null {
  const m = /테스트[^:]*:\s*([^/\n]{1,30})/.exec(body);
  return m ? m[1]!.trim() : null;
}

type Who = (typeof WELCOME_NAMES)[number];

/** 닉네임별 말투 (10/22 사용자 확정 페르소나): 노방장 30대 총무형 존댓말, 돈키호테 차분한 ~네요, 덕후1호 20대 짧은 반말 */
const by = <T,>(who: string, m: Record<Who, T>): T => m[(WELCOME_NAMES as readonly string[]).includes(who) ? (who as Who) : "노방장"];

/** "응원 팀: FC서울 / 직관파" → "FC서울" (없거나 "-"면 null) */
export function resultTeam(body: string): string | null {
  const m = /응원\s*(?:팀|구단)\s*:\s*([^/\n]{1,20})/.exec(body);
  const t = m?.[1]?.trim();
  return t && t !== "-" ? t : null;
}

/**
 * 첫 댓글에 붙일 환영 한 줄 — 짧게. 같은 팀·타입인 사람이 있으면 그 사람을 불러 잇는다 (Sprint 94).
 * 10/22 실제 카톡방 말투: 15자 안팎, 말투 표시(ㅎㅎ·ㄷㄷ·^^)는 한 번에 하나까지, 질문은 가끔만, 이모지·느낌표 없이.
 * 표현은 닉네임마다 여러 개를 두고 댓글마다 돌려 쓴다 (v).
 */
export function welcomeText(c: Pick<First, "nickname" | "post_id" | "chat"> & { body?: string }, peer?: Peer | null, v = 0, who: string = "노방장"): string {
  const n = c.nickname;
  // 테스트 결과가 채팅으로 오면 (10/23) 그 결과에 반응하고, 그냥 수다면 채팅 인사
  const isResult = TEST_POST_IDS.has(c.post_id) && !!c.body && !!(resultTeam(c.body) || resultType(c.body));
  if (c.chat && !isResult)
    return pick(
      by(who, {
        노방장: [`${n}님 어서 오세요`, `${n}님 왔네요 ㅎㅎ`, `${n}님 편하게 있다 가세요`, `오 ${n}님 처음이시죠`],
        돈키호테: [`${n}님 반갑습니다`, `${n}님 처음 뵙네요`, `${n}님 오셨군요`],
        덕후1호: [`오 ${n}님 왔다`, `${n}님 어서와요`, `새 얼굴이다 ${n}님`],
      }),
      v,
    );
  // 10/22: 실제 카톡방에선 남을 서로 소개해 주지 않는다(메시지 120만 개 중 0.001%) → @로 다른 사람을 부르지 않고, 그 사람 얘기에만 반응
  const team = c.body ? resultTeam(c.body) : null;
  if (TEST_POST_IDS.has(c.post_id) && team)
    return pick(
      by(who, {
        노방장: [`${team} 팬이시구나`, `오 ${team} ㅎㅎ`, `${team} 요즘 분위기 좋던데`, `${n}님 ${team}이시네요`],
        돈키호테: [`${team} 팬이시군요`, `${team}이시네요`, `${team} 응원하시는군요`],
        덕후1호: [`오 ${team}`, `${team} 팬 왔다`, `${team} 요즘 좋던데`],
      }),
      v,
    );
  if (TEST_POST_IDS.has(c.post_id) && (!c.chat || isResult)) {
    const t = c.body ? resultType(c.body) : null;
    if (t)
      return pick(
        by(who, {
          노방장: [`${t} 나왔네요 ㅎㅎ`, `${n}님 ${t}이시구나`, `${t} 잘 어울리네요`, `오 ${t} 처음 보는 것 같은데`],
          돈키호테: [`${n}님은 ${t}이시군요`, `${t}라니 재밌네요`, `${t} 결과 잘 봤습니다`],
          덕후1호: [`${t} ㄷㄷ`, `오 ${t} 나왔네`, `${t} 인정`],
        }),
        v,
      );
    return pick(
      by(who, {
        노방장: [`${n}님 결과 고마워요`, `${n}님 결과 반가워요`, `${n}님 결과 잘 봤어요 ^^`],
        돈키호테: [`${n}님 결과 잘 봤습니다`, `위에 비슷한 분이 계실지도요`],
        덕후1호: [`결과 ㄱㅅ요 ${n}님`, `오 ${n}님 결과 떴다`],
      }),
      v,
    );
  }
  return pick(
    by(who, {
      노방장: [`${n}님 첫 댓글 고마워요`, `${n}님 어서 오세요 ^^`, `${n}님 편하게 계세요`],
      돈키호테: [`${n}님 반갑습니다`, `${n}님 처음 뵙네요`],
      덕후1호: [`${n}님 어서와요`, `오 새 얼굴 ${n}님`],
    }),
    v,
  );
}

/**
 * 첫 댓글 환영 (Sprint 92). 10/22 사용자: 4명 중 1명 → 다시 모두에게(every=1), 운영 닉네임 셋을 번갈아 가며. 표현은 여러 개를 돌려 쓴다. 처음 댓글을 남긴 사람(브라우저)에게 1분쯤 뒤 운영 계정 이름으로 답글 하나.
 * 첫 반응이 빨리 와야 다시 온다. 이미 운영 계정이 답했거나, 가려졌거나, 30분 넘게 지난 댓글은 건너뛴다.
 */
export async function runWelcome(now = new Date(), every = 1): Promise<number> {
  // 10/25 대표님: "앞으로 내 허락없이는 댓글 달지마" → 자동 환영 답글은 끈다 (다시 켜려면 대표님 허락 필요)
  if (!welcomeOn()) return 0;
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
        // 닉네임과 표현이 같이 돌면 같은 닉네임이 늘 같은 말을 해서, 표현 번호는 닉네임 순번과 따로 센다
        const v = Math.floor(Number(c.id) / every / WELCOME_NAMES.length);
        await createComment(c.post_id, { nickname, pin: String(randomInt(1000, 10000)), body: welcomeText(c, null, v, nickname), parentId: c.id });
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
  const tick = guardJob("welcome", runWelcome);
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
