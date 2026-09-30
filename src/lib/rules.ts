/**
 * 커뮤니티 규칙 (Sprint 21) — 자동 규칙의 기준값과 그 값을 바꾸는 투표 규칙.
 *
 * 서버·클라이언트 공용(순수 함수). 현재 값은 DB(community_rules)에 있고 src/lib/repo/rules.ts 가 읽는다.
 * 여기 적힌 안전 범위·한 번에 바꿀 수 있는 폭·투표 방식은 투표로 바꿀 수 없다 (규칙을 무력화하는 투표를 막기 위해).
 */

export const RULE_KEYS = [
  "post_blind_reports",
  "correction_hide_reports",
  "correction_support_score",
  "correction_support_ratio",
  "spam_suppress_score",
  "board_promotion_votes",
  "trust_min_votes",
  "renewal_min_reports",
  "write_limit_blinds",
  "write_limit_days",
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

export type RuleDef = {
  key: RuleKey;
  label: string;
  /** 규칙이 하는 일 — "{v}" 자리에 현재 값 */
  sentence: string;
  /** 값을 올리면/내리면 어떻게 되는지 (제안 화면 안내) */
  higher: string;
  lower: string;
  unit: string;
  /** 코드 기본값 (보드 개설 표 수는 서버가 환경변수로 덮어쓴다) */
  defaultValue: number;
  min: number;
  max: number;
  /** 한 번의 투표로 바꿀 수 있는 폭: 절댓값, 또는 현재 값에 대한 비율 */
  maxChange: { abs: number } | { ratio: number };
  /** 소수 자릿수 (0 = 정수) */
  decimals: 0 | 1 | 2;
  step: number;
};

export const RULES: Record<RuleKey, RuleDef> = {
  post_blind_reports: {
    key: "post_blind_reports",
    label: "글 자동 블라인드 신고 수",
    sentence: "서로 다른 {v}명 이상이 신고하고 신고 가중치 합도 {v} 이상이면 글이 자동으로 블라인드됩니다.",
    higher: "블라인드가 더 어려워집니다 (악성 글이 오래 보일 수 있음).",
    lower: "블라인드가 쉬워집니다 (몇 명이 짜고 멀쩡한 글을 가리기 쉬워짐).",
    unit: "명",
    defaultValue: 5,
    min: 3,
    max: 20,
    maxChange: { abs: 2 },
    decimals: 0,
    step: 1,
  },
  correction_hide_reports: {
    key: "correction_hide_reports",
    label: "정정 제안 자동 가림 신고 수",
    sentence: "정정 제안에 고유 신고 {v}건, 가중치 합 {v} 이상이면 자동으로 가려집니다.",
    higher: "정정 제안이 가려지기 어려워집니다.",
    lower: "정정 제안이 쉽게 가려집니다 (글 작성자 쪽이 불리한 제안을 가리기 쉬워짐).",
    unit: "건",
    defaultValue: 5,
    min: 3,
    max: 20,
    maxChange: { abs: 2 },
    decimals: 0,
    step: 1,
  },
  correction_support_score: {
    key: "correction_support_score",
    label: "정정 제안 '커뮤니티 동의' 최소 점수",
    sentence: "정정 제안의 동의 가중치 합이 {v} 이상이어야 '커뮤니티 동의'가 됩니다.",
    higher: "동의 표시가 어려워집니다 (틀린 수치가 오래 집계에 남을 수 있음).",
    lower: "동의 표시가 쉬워집니다 (몇 명이 맞는 수치를 집계에서 빼기 쉬워짐).",
    unit: "점",
    defaultValue: 3,
    min: 2,
    max: 15,
    maxChange: { abs: 2 },
    decimals: 0,
    step: 1,
  },
  correction_support_ratio: {
    key: "correction_support_ratio",
    label: "정정 제안 동의/반대 배수",
    sentence: "동의 가중치가 반대의 {v}배 이상이어야 '커뮤니티 동의'가 됩니다.",
    higher: "반대가 조금만 있어도 동의가 되지 않습니다.",
    lower: "반대가 꽤 있어도 동의가 됩니다.",
    unit: "배",
    defaultValue: 2,
    min: 1.5,
    max: 4,
    maxChange: { abs: 0.5 },
    decimals: 1,
    step: 0.5,
  },
  spam_suppress_score: {
    key: "spam_suppress_score",
    label: "광고 의심 자동 하향 점수",
    sentence: "광고·스팸 점수가 {v} 이상인 글은 목록 아래로 내려가고 '광고 의심'이 표시됩니다.",
    higher: "광고 글이 걸러지기 어려워집니다.",
    lower: "평범한 제품 후기까지 광고 의심으로 내려갈 수 있습니다.",
    unit: "점",
    defaultValue: 0.8,
    min: 0.6,
    max: 0.95,
    maxChange: { abs: 0.1 },
    decimals: 2,
    step: 0.05,
  },
  board_promotion_votes: {
    key: "board_promotion_votes",
    label: "새 보드 개설에 필요한 표",
    sentence: "보드 개설 요청이 {v}표를 모으면 (올라온 지 하루가 지난 뒤) 자동으로 보드가 생깁니다.",
    higher: "보드가 늘어나기 어려워집니다.",
    lower: "보드가 쉽게 생깁니다 (비슷한 보드가 흩어질 수 있음).",
    unit: "표",
    defaultValue: 50,
    min: 10,
    max: 500,
    maxChange: { ratio: 0.5 },
    decimals: 0,
    step: 1,
  },
  trust_min_votes: {
    key: "trust_min_votes",
    label: "신뢰도 배지 최소 표",
    sentence: "추천·비추천이 {v}표 이상 모인 정보 글만 신뢰도 배지(상위 5·12·19%)를 받습니다.",
    higher: "배지가 늦게 붙지만 소수 표에 덜 흔들립니다.",
    lower: "배지가 빨리 붙지만 몇 표로 순위가 흔들립니다.",
    unit: "표",
    defaultValue: 3,
    min: 2,
    max: 20,
    maxChange: { abs: 2 },
    decimals: 0,
    step: 1,
  },
  renewal_min_reports: {
    key: "renewal_min_reports",
    label: "제품 리뉴얼 인정 제보 수",
    sentence: "같은 제품의 표시값이 바뀐 뒤 서로 다른 {v}명 이상이 새 값을 제보하면 '리뉴얼'로 보고, 제품 페이지·성분 검색이 새 라벨 값을 기준으로 바뀝니다.",
    higher: "리뉴얼 인정이 늦어집니다 (바뀐 라벨이 한동안 옛 값과 섞여 보임).",
    lower: "리뉴얼 인정이 빨라지지만, 몇 명이 짜고 같은 틀린 값을 올려 '리뉴얼'로 만들기 쉬워집니다.",
    unit: "명",
    defaultValue: 2,
    min: 2,
    max: 5,
    maxChange: { abs: 1 },
    decimals: 0,
    step: 1,
  },
  write_limit_blinds: {
    key: "write_limit_blinds",
    label: "쓰기 제한이 걸리는 블라인드 수",
    sentence: "같은 곳에서 쓴 글이 최근 30일 안에 이용자 신고로 {v}번 블라인드되면, 한동안 글·댓글·정정 제안을 쓸 수 없습니다 (강퇴 대신, 사람 판단 없이 자동).",
    higher: "쓰기 제한이 늦게 걸립니다 (신고를 반복해서 받는 사람이 계속 쓸 수 있음).",
    lower: "쓰기 제한이 빨리 걸리지만, 몇 명이 짜고 신고해 멀쩡한 사람의 쓰기를 막기 쉬워집니다.",
    unit: "번",
    defaultValue: 3,
    min: 2,
    max: 10,
    maxChange: { abs: 1 },
    decimals: 0,
    step: 1,
  },
  write_limit_days: {
    key: "write_limit_days",
    label: "쓰기 제한 기간",
    sentence: "쓰기 제한은 마지막 블라인드부터 {v}일 동안입니다.",
    higher: "제한이 길어집니다.",
    lower: "제한이 짧아집니다.",
    unit: "일",
    defaultValue: 7,
    min: 1,
    max: 30,
    maxChange: { abs: 3 },
    decimals: 0,
    step: 1,
  },
};

export type RuleValues = Record<RuleKey, number>;

export function isRuleKey(k: string): k is RuleKey {
  return (RULE_KEYS as readonly string[]).includes(k);
}

export function formatRule(key: RuleKey, v: number): string {
  const d = RULES[key].decimals;
  return v.toLocaleString("ko-KR", { minimumFractionDigits: d === 2 ? 2 : 0, maximumFractionDigits: d });
}

export function ruleSentence(key: RuleKey, v: number): string {
  return RULES[key].sentence.replaceAll("{v}", formatRule(key, v));
}

/** 한 번의 투표로 갈 수 있는 범위 (안전 범위 안) */
export function allowedRange(key: RuleKey, current: number): { min: number; max: number } {
  const def = RULES[key];
  const delta = "abs" in def.maxChange ? def.maxChange.abs : Math.max(def.step, Math.floor(current * def.maxChange.ratio));
  return { min: Math.max(def.min, round(key, current - delta)), max: Math.min(def.max, round(key, current + delta)) };
}

function round(key: RuleKey, v: number): number {
  const f = 10 ** RULES[key].decimals;
  return Math.round(v * f) / f;
}

/** 제안 값 검사 — 문제가 있으면 이유 */
export function proposalProblem(key: RuleKey, current: number, next: number): string | null {
  const def = RULES[key];
  if (!Number.isFinite(next)) return "숫자를 입력해주세요.";
  if (round(key, next) !== next) return def.decimals ? `소수 ${def.decimals}자리까지 쓸 수 있어요.` : "정수로 입력해주세요.";
  const onStep = Math.abs(Math.round((next - def.min) / def.step) * def.step - (next - def.min)) < 1e-9;
  if (!onStep) return `${formatRule(key, def.step)} 단위로 정할 수 있어요.`;
  if (next === current) return "지금 값과 같아요.";
  if (next < def.min || next > def.max) return `안전 범위(${formatRule(key, def.min)}~${formatRule(key, def.max)}${def.unit}) 밖이에요.`;
  const r = allowedRange(key, current);
  if (next < r.min || next > r.max) return `한 번에 ${formatRule(key, r.min)}~${formatRule(key, r.max)}${def.unit} 사이로만 바꿀 수 있어요.`;
  return null;
}

// ---------------------------------------------------------------------------
// 투표 방식 (투표로 바꿀 수 없음)
// ---------------------------------------------------------------------------

export const VOTING_DAYS = 7;
/** 가결: 가중치 합 기준 찬성 2/3 이상 */
export const PASS_RATIO = 2 / 3;
/** 같은 규칙은 결정(가결·부결)된 뒤 이 기간 동안 다시 제안할 수 없다 */
export const COOLDOWN_DAYS = 14;
/** 투표·제안 자격: 첫 활동 후 7일 이상 + 기여(글·댓글·정정 제안) 3건 이상 */
export const ELIGIBLE_AGE_DAYS = 7;
export const FULL_WEIGHT_AGE_DAYS = 30;
export const MIN_CONTRIBUTIONS = 3;
/** 정족수: 최근 30일 투표 자격이 있는 이용자의 5% (가중치 합), 최소 10 */
export const QUORUM_MIN = 10;
export const QUORUM_SHARE = 0.05;

export type Eligibility = { weight: 0 | 0.5 | 1; reason: string | null };

/** 계정(식별값) 나이와 기여 수로 표 가중치를 정한다 — 급조한 표를 줄이기 위해 */
export function voteWeight(ageDays: number, contributions: number): Eligibility {
  if (ageDays < ELIGIBLE_AGE_DAYS) {
    return { weight: 0, reason: `처음 활동한 지 ${ELIGIBLE_AGE_DAYS}일이 지나야 투표할 수 있어요 (지금 ${Math.floor(ageDays)}일).` };
  }
  if (contributions < MIN_CONTRIBUTIONS) {
    return { weight: 0, reason: `글·댓글·정정 제안을 ${MIN_CONTRIBUTIONS}건 이상 남긴 뒤 투표할 수 있어요 (지금 ${contributions}건).` };
  }
  return { weight: ageDays >= FULL_WEIGHT_AGE_DAYS ? 1 : 0.5, reason: null };
}

export function quorumFor(eligibleVoters: number): number {
  return Math.max(QUORUM_MIN, Math.ceil(eligibleVoters * QUORUM_SHARE));
}

export type Tally = { yes: number; no: number; total: number; quorum: number; quorumMet: boolean; passed: boolean; note: string };

export function tally(yes: number, no: number, quorum: number): Tally {
  const total = yes + no;
  const quorumMet = total >= quorum;
  const passed = quorumMet && yes >= total * PASS_RATIO - 1e-9;
  const note = passed
    ? "가결"
    : !quorumMet
      ? `정족수 미달 (${total.toLocaleString("ko-KR")} / ${quorum.toLocaleString("ko-KR")})`
      : `찬성이 3분의 2에 못 미침 (${Math.round((yes / total) * 100)}%)`;
  return { yes, no, total, quorum, quorumMet, passed, note };
}

// ---------------------------------------------------------------------------
// 조작 탐지 (Sprint 23) — 자동으로 지우지 않고 알림만. 운영자는 탐지된 표만 통째로 무효화하거나 오탐으로 닫는다.
// ---------------------------------------------------------------------------

/** "자격을 갓 채운" 계정: 첫 활동 10일 미만 + 기여 4건 이하 */
export const FRESH_AGE_DAYS = 10;
export const FRESH_MAX_CONTRIBUTIONS = 4;
/** 한쪽(찬성/반대)에 이런 표가 4개 이상이고 그쪽 투표자의 30% 이상이면 */
export const FRESH_MIN_VOTES = 4;
export const FRESH_MIN_SHARE = 0.3;
/** 같은 망(IP 대역)에서 30일 미만 계정이 같은 쪽에 3표 이상 */
export const NET_MIN_VOTES = 3;
export const NET_YOUNG_DAYS = 30;
/** 검토 중인 조작 의심 알림이 있으면 마감을 이만큼까지 미룬다 */
export const HOLD_HOURS = 72;
