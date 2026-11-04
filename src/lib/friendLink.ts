/**
 * 🤝 친구 대결·궁합 링크 (11/2 대표님 "사람을 끌어오고 공유하게 하고 다시 오게").
 * 서버에 아무것도 저장하지 않는다. 링크 주소(쿼리)에 내 점수나 내 타입만 싣고, 친구 브라우저가 읽어 비교한다.
 * - 점수 대결: ?vs=<점수>&n=<닉네임> (🥊 Versus 와 같은 꼴. 황금귀·첫 문장·반응속도·NTRP·타자)
 * - 타입 궁합: ?m=<타입키>&n=<닉네임>[&t=<K리그 팀>] (💘 연애 성향, ⚽ 팬 테스트)
 * 서버(링크 미리보기 OG 이미지·제목)와 브라우저가 같은 함수를 쓴다. 순수 함수만.
 */
import { FAN_TYPES, type FanType } from "./fanTest";
import { LOVE_TYPES, type LoveType } from "./loveTest";
import { ntrpBand } from "./ntrpTest";
import { K_LEAGUE_TEAMS } from "./peers";

export const SITE = "https://nobangjang.com";

/** 닉네임: 글자·숫자·공백·_.- 만, 12자까지 */
export const cleanName = (s: string | null | undefined) => (s ?? "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 12);

// ───────── 점수 대결 ─────────

export type ScoreTestKey = "ear" | "first-line" | "reaction" | "ntrp" | "typing";
export type ScoreTest = {
  key: ScoreTestKey;
  path: string;
  emoji: string;
  title: string;
  min: number;
  max: number;
  /** 작을수록 잘한 것 (반응속도) */
  lowerBetter?: boolean;
  /** 화면에 보이는 점수 */
  format: (n: number) => string;
};

export const SCORE_TESTS: Record<ScoreTestKey, ScoreTest> = {
  ear: { key: "ear", path: "/ear-test", emoji: "🎧", title: "황금귀 테스트", min: 0, max: 10, format: (n) => `10문제 중 ${n}개` },
  "first-line": { key: "first-line", path: "/first-line-test", emoji: "📚", title: "첫 문장 테스트", min: 0, max: 10, format: (n) => `10문제 중 ${n}개` },
  reaction: { key: "reaction", path: "/games/reaction", emoji: "⚡", title: "반응속도 결투", min: 80, max: 2000, lowerBetter: true, format: (n) => `${(n / 1000).toFixed(3)}초` },
  // NTRP 는 6문항 합계(6~24점)를 싣고, 보이는 건 등급
  ntrp: { key: "ntrp", path: "/ntrp-test", emoji: "🎾", title: "NTRP 자가진단", min: 6, max: 24, format: (n) => `NTRP ${ntrpBand(n).level}` },
  typing: { key: "typing", path: "/typing-test", emoji: "⌨️", title: "한글 타자 테스트", min: 0, max: 1500, format: (n) => `${n}타` },
};

export type VsScore = { score: number; name: string };

/** 쿼리에서 상대 점수 읽기. 범위 밖·숫자 아님이면 null */
export function decodeVs(q: URLSearchParams, min: number, max: number): VsScore | null {
  if (!q.has("vs")) return null;
  const raw = q.get("vs") ?? "";
  if (!/^\d{1,5}$/.test(raw)) return null;
  const score = Number(raw);
  if (score < min || score > max) return null;
  return { score, name: cleanName(q.get("n")) || "친구" };
}

export function encodeVs(path: string, score: number, name: string): string {
  const q = new URLSearchParams({ vs: String(Math.round(score)) });
  const n = cleanName(name);
  if (n) q.set("n", n);
  q.set("from", "vs");
  return `${SITE}${path}?${q.toString()}`;
}

/** 내가 이겼나: 1 이김 · 0 비김 · -1 짐 */
export function vsOutcome(mine: number, theirs: number, lowerBetter = false): 1 | 0 | -1 {
  if (mine === theirs) return 0;
  return (lowerBetter ? mine < theirs : mine > theirs) ? 1 : -1;
}

export const OUTCOME_LABEL = { 1: "🎉 이겼어요!", 0: "🤝 비겼어요", [-1]: "😅 졌어요" } as const;

// ───────── 타입 궁합 ─────────

type Compat = { pct: number; line: string };
/** 두 타입 키를 정렬해 붙인 키 ("a|b", a ≤ b) */
const pairKey = (a: string, b: string) => (a <= b ? `${a}|${b}` : `${b}|${a}`);

/**
 * 💘 연애 성향 궁합표 (재미용으로 정한 값. 설문·통계가 아니다). 순서와 상관없이 같은 값.
 * 원칙: 서로 채워 주는 짝(대화형 × 천천히, 직진 × 대화형)은 높게, 같은 성향끼리는 장단이 같아 중간.
 *
 *            direct  slow  talk  plan
 *   direct     82     68    86    78
 *   slow              74    88    80
 *   talk                    84    76
 *   plan                          72
 */
export const LOVE_COMPAT: Record<string, Compat> = {
  [pairKey("direct", "direct")]: { pct: 82, line: "둘 다 직진이라 시작이 빨라요. 속도만 맞추면 돼요." },
  [pairKey("direct", "slow")]: { pct: 68, line: "한 명은 달리고 한 명은 걸어요. 기다려 주면 오래가요." },
  [pairKey("direct", "talk")]: { pct: 86, line: "솔직한 말이 잘 통해요. 오해가 쌓일 틈이 없어요." },
  [pairKey("direct", "plan")]: { pct: 78, line: "한 명이 정하고 한 명이 챙겨요. 실행력이 좋은 짝이에요." },
  [pairKey("slow", "slow")]: { pct: 74, line: "둘 다 신중해요. 누가 먼저 말할지가 관건이에요." },
  [pairKey("slow", "talk")]: { pct: 88, line: "긴 대화로 천천히 가까워져요. 갈수록 깊어지는 사이예요." },
  [pairKey("slow", "plan")]: { pct: 80, line: "차분한 데이트가 잘 맞아요. 편안한 사이가 돼요." },
  [pairKey("talk", "talk")]: { pct: 84, line: "할 말이 끝이 없어요. 카페 마감 시간을 조심하세요." },
  [pairKey("talk", "plan")]: { pct: 76, line: "한 명은 코스를 짜고 한 명은 분위기를 채워요." },
  [pairKey("plan", "plan")]: { pct: 72, line: "둘 다 계획을 짜요. 누구 일정표로 갈지 먼저 정하세요." },
};

export function loveCompat(a: string, b: string): Compat | null {
  return LOVE_COMPAT[pairKey(a, b)] ?? null;
}

/**
 * ⚽ 직관 메이트 궁합표 (재미용으로 정한 값). 같이 경기장 가기 좋은 정도: 직관파끼리 높고, 소파 응원단과는 낮게.
 * 응원 팀이 같으면 +8 (99에서 멈춤). 팀이 다르거나 모르면 그대로.
 *
 *              away  ultra  analyst  collector  sofa
 *   away        90    92      74        80       58
 *   ultra             94      70        84       62
 *   analyst                   86        66       76
 *   collector                           88       72
 *   sofa                                         78
 */
export const FAN_COMPAT: Record<string, Compat> = {
  [pairKey("away", "away")]: { pct: 90, line: "원정 버스 옆자리는 정해졌어요." },
  [pairKey("away", "ultra")]: { pct: 92, line: "원정석에서 같이 목이 쉬어요." },
  [pairKey("away", "analyst")]: { pct: 74, line: "가는 길엔 응원하고 오는 길엔 복기해요." },
  [pairKey("away", "collector")]: { pct: 80, line: "원정 한정 굿즈를 같이 노려요." },
  [pairKey("away", "sofa")]: { pct: 58, line: "한 명은 원정, 한 명은 집에서 든든한 지원군이에요." },
  [pairKey("ultra", "ultra")]: { pct: 94, line: "응원가 화음이 맞아요. 서포터석으로 가요." },
  [pairKey("ultra", "analyst")]: { pct: 70, line: "한 명은 응원, 한 명은 해설. 하프타임이 즐거워요." },
  [pairKey("ultra", "collector")]: { pct: 84, line: "머플러를 흔드는 사람과 모으는 사람이 만났어요." },
  [pairKey("ultra", "sofa")]: { pct: 62, line: "첫 직관은 응원단이 데려가 주세요." },
  [pairKey("analyst", "analyst")]: { pct: 86, line: "경기가 끝나도 복기가 두 시간이에요." },
  [pairKey("analyst", "collector")]: { pct: 66, line: "기록지와 유니폼, 취향은 달라도 마음은 같아요." },
  [pairKey("analyst", "sofa")]: { pct: 76, line: "해설을 들으며 보니 집관이 더 재밌어요." },
  [pairKey("collector", "collector")]: { pct: 88, line: "굿즈 매장 줄을 같이 서요." },
  [pairKey("collector", "sofa")]: { pct: 72, line: "유니폼 빌려 입고 첫 직관 가기 좋아요." },
  [pairKey("sofa", "sofa")]: { pct: 78, line: "치킨 시키고 집관하는 최고의 메이트예요." },
};

export const SAME_TEAM_BONUS = 8;

export function fanCompat(a: string, b: string, teamA?: string | null, teamB?: string | null): (Compat & { sameTeam: boolean; rival: boolean }) | null {
  const base = FAN_COMPAT[pairKey(a, b)];
  if (!base) return null;
  const sameTeam = !!teamA && teamA === teamB;
  const rival = !!teamA && !!teamB && teamA !== teamB;
  return { pct: sameTeam ? Math.min(99, base.pct + SAME_TEAM_BONUS) : base.pct, line: base.line, sameTeam, rival };
}

export const isKTeam = (t: string | null | undefined): t is string => !!t && K_LEAGUE_TEAMS.includes(t);

export type Mate<T> = { type: T; name: string; team: string | null };

/** 궁합 링크 읽기: ?m=타입키&n=닉네임[&t=팀]. 없는 타입이면 null, 모르는 팀은 버린다 */
export function decodeMate<T>(q: URLSearchParams, types: Record<string, T>): Mate<T> | null {
  const m = q.get("m") ?? "";
  if (!Object.prototype.hasOwnProperty.call(types, m)) return null;
  const t = q.get("t");
  return { type: types[m]!, name: cleanName(q.get("n")) || "친구", team: isKTeam(t) ? t : null };
}

export function encodeMate(path: string, typeKey: string, name: string, team?: string | null): string {
  const q = new URLSearchParams({ m: typeKey });
  const n = cleanName(name);
  if (n) q.set("n", n);
  if (isKTeam(team)) q.set("t", team);
  q.set("from", "mate");
  return `${SITE}${path}?${q.toString()}`;
}

export const decodeLoveMate = (q: URLSearchParams): Mate<LoveType> | null => decodeMate(q, LOVE_TYPES);
export const decodeFanMate = (q: URLSearchParams): Mate<FanType> | null => decodeMate(q, FAN_TYPES);

// ───────── 링크 미리보기 (카톡 OG) ─────────

export type FriendTestKey = ScoreTestKey | "love" | "fan";
export type FriendCard = { emoji: string; kicker: string; headline: string; sub: string };

const toSearch = (sp: Record<string, string | string[] | undefined> | URLSearchParams): URLSearchParams => {
  if (sp instanceof URLSearchParams) return sp;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  return q;
};

/** 대결·궁합 링크면 미리보기 카드 글귀, 아니면 null */
export function friendCard(test: FriendTestKey, sp: Record<string, string | string[] | undefined> | URLSearchParams): FriendCard | null {
  const q = toSearch(sp);
  if (test === "love") {
    const m = decodeLoveMate(q);
    if (!m) return null;
    return { emoji: "💘", kicker: "연애 성향 궁합", headline: `${m.name}님은 ${m.type.emoji} ${m.type.name}`, sub: "나는 어떤 성향일까? 1분 하고 궁합 보기" };
  }
  if (test === "fan") {
    const m = decodeFanMate(q);
    if (!m) return null;
    return { emoji: "⚽", kicker: "직관 메이트 궁합", headline: `${m.name}님은 ${m.type.emoji} ${m.type.name}${m.team ? ` (${m.team})` : ""}`, sub: "나는 어떤 팬일까? 1분 하고 궁합 보기" };
  }
  const t = SCORE_TESTS[test];
  const vs = decodeVs(q, t.min, t.max);
  if (!vs) return null;
  return { emoji: t.emoji, kicker: `${t.title} 친구 대결`, headline: `${vs.name}님 기록: ${t.format(vs.score)}`, sub: "이길 수 있어요? 눌러서 바로 대결하기" };
}

/** 카드 이미지 주소 (미리보기용). 대결·궁합 값만 넘긴다 */
export function friendCardUrl(test: FriendTestKey, sp: Record<string, string | string[] | undefined> | URLSearchParams): string {
  const q = toSearch(sp);
  const out = new URLSearchParams({ test });
  for (const k of ["vs", "n", "m", "t"]) {
    const v = q.get(k);
    if (v) out.set(k, v);
  }
  return `/api/card/friend?${out.toString()}`;
}

export const isFriendTest = (s: string | null): s is FriendTestKey => s === "love" || s === "fan" || (!!s && Object.prototype.hasOwnProperty.call(SCORE_TESTS, s));

/**
 * 🔗 공유 링크에 ?from=share 를 붙인다 (11/4 대표님 "무료 게시물로 자립" 5번: 공유 고리).
 * 관리자 유입 경로에 "공유 링크"로 잡힌다(classifySource). 이미 from 이 있으면 그대로 둔다. 상대·절대 주소 모두.
 */
export function withShare(url: string): string {
  const hashAt = url.indexOf("#");
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  if (/[?&]from=/.test(base)) return url;
  return `${base}${base.includes("?") ? "&" : "?"}from=share${hash}`;
}
