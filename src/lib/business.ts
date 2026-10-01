/**
 * 사업 지표 (Sprint 40) — PMF·방향·존폐·성장을 판단하는 숫자와 신호등 기준. 서버·클라이언트 공용 순수 함수.
 *
 * 사람 세기: 가입이 없어 "사람"은 추정이다.
 *  - 방문자 = 1st-party 쿠키(lr_vid)를 변환한 값. 기기·브라우저마다 따로 센다.
 *  - 참여자 = IP+브라우저 fingerprint. 같은 사람이 망을 바꾸면 둘로 센다.
 * 두 식별자는 서로 연결하지 않으므로, 절대값보다 추세를 본다.
 */

export type Signal = "green" | "yellow" | "red" | "na";

export const SIGNAL_ICON: Record<Signal, string> = { green: "🟢", yellow: "🟡", red: "🔴", na: "⚪" };
export const SIGNAL_LABEL: Record<Signal, string> = { green: "좋음", yellow: "주의", red: "위험", na: "표본 부족" };

/** 값이 클수록 좋은 지표. sample 이 minSample 보다 작으면 판단하지 않는다 */
export function signal(value: number | null, green: number, yellow: number, sample: number, minSample: number): Signal {
  if (value === null || !Number.isFinite(value) || sample < minSample) return "na";
  if (value >= green) return "green";
  if (value >= yellow) return "yellow";
  return "red";
}

export function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

/** 전주 대비 성장률 (이전 값이 0이면 계산하지 않음) */
export function growth(current: number, previous: number): number | null {
  return previous > 0 ? current / previous - 1 : null;
}

/** 연속된 주간 값의 평균 주간 성장률 (복리). 첫 값이 0이면 null */
export function avgWeeklyGrowth(series: number[]): number | null {
  const s = series.filter((v) => Number.isFinite(v));
  if (s.length < 2 || s[0]! <= 0 || s[s.length - 1]! < 0) return null;
  return Math.pow(s[s.length - 1]! / s[0]!, 1 / (s.length - 1)) - 1;
}

/** 지표 정의와 기준 (화면 설명·주간 리포트에서 같이 쓴다) */
export const METRIC_DEFS = {
  retention: {
    label: "4주 잔존율",
    question: "PMF",
    what: "첫 방문 주 기준, 4주 뒤 그 주에 다시 온 방문자 비율 (4주 이상 지난 최근 코호트 평균)",
    green: 0.15,
    yellow: 0.07,
    minSample: 30,
    why: "잔존 곡선이 0으로 떨어지지 않고 평평해지면 PMF 신호. 커뮤니티는 4주 15% 이상이면 양호",
  },
  stickiness: {
    label: "고착도 (DAU/MAU)",
    question: "PMF",
    what: "최근 28일 일평균 방문자 ÷ 28일 고유 방문자",
    green: 0.2,
    yellow: 0.1,
    minSample: 50,
    why: "20% 이상이면 습관처럼 오는 곳, 10% 미만이면 가끔 보는 사이트",
  },
  pmf: {
    label: "매우 아쉽다 비율",
    question: "PMF",
    what: "\"노방장이 없어진다면?\" 설문에서 '매우 아쉽다' 비율 (최근 90일)",
    green: 0.4,
    yellow: 0.25,
    minSample: 40,
    why: "숀 엘리스 테스트 — 40% 이상이 대표적인 PMF 기준. 응답 40개 미만이면 판단 보류",
  },
  participation: {
    label: "참여 전환율",
    question: "방향",
    what: "최근 28일 참여자(글·댓글·추천을 한 사람) ÷ 방문자",
    green: 0.05,
    yellow: 0.01,
    minSample: 100,
    why: "보는 곳에서 하는 곳으로 바뀌는 정도. 커뮤니티는 보통 1~5%",
  },
  aliveRooms: {
    label: "살아 있는 방",
    question: "방향",
    what: "최근 7일 작성자(글·댓글) 3명 이상인 방 ÷ 전체 방",
    green: 0.5,
    yellow: 0.2,
    minSample: 3,
    why: "어떤 주제가 붙는지. 죽은 방이 많으면 방을 합치거나 살아 있는 주제에 집중",
  },
  coreRetention: {
    label: "핵심 작성자 유지율",
    question: "존폐",
    what: "29~56일 전 이틀 이상 글·댓글을 쓴 사람 중 최근 28일에도 쓴 비율",
    green: 0.6,
    yellow: 0.4,
    minSample: 10,
    why: "콘텐츠는 상위 1~10%가 만든다. 이 비율이 몇 달째 떨어지면 위험 신호",
  },
  responsiveness: {
    label: "24시간 응답률",
    question: "존폐",
    what: "최근 7일(마지막 24시간 제외) 사람이 쓴 글 중 24시간 안에 다른 사람 댓글이 달린 비율",
    green: 0.6,
    yellow: 0.4,
    minSample: 10,
    why: "50% 미만이면 글쓴이가 '아무도 안 보네' 하고 떠난다",
  },
  growth: {
    label: "주간 성장률",
    question: "성장",
    what: "최근 4주 동안 주간 방문자의 평균 주간 성장률 (복리)",
    green: 0.05,
    yellow: 0,
    minSample: 50,
    why: "초기에는 주 5~10%면 좋은 페이스, 마이너스면 줄어드는 중",
  },
  wordOfMouth: {
    label: "입소문 유입 비중",
    question: "성장",
    what: "최근 28일 외부 유입(검색·직접·SNS·다른 사이트) 중 검색이 아닌 비중",
    green: 0.4,
    yellow: 0.2,
    minSample: 100,
    why: "사람이 데려오는 비율이 늘면 광고·검색 없이도 크는 자생적 성장",
  },
} as const;

export type MetricKey = keyof typeof METRIC_DEFS;

export type CohortRow = { week: string; size: number; w1: number | null; w4: number | null; w8: number | null };
export type WeekRow = { week: string; visitors: number; contributors: number; posts: number; comments: number };
export type RoomRow = { slug: string; name: string; authors7d: number; authorsPrev7d: number; posts7d: number; comments7d: number };

export type BusinessMetrics = {
  generatedAt: string;
  /** 지표별 값과 신호 */
  values: Record<MetricKey, { value: number | null; sample: number; signal: Signal }>;
  cohorts: CohortRow[];
  weeks: WeekRow[];
  rooms: RoomRow[];
  visitors28d: number;
  contributors28d: number;
  newContributors7d: number;
  coreThisWeek: number;
  coreFourWeeksAgo: number;
  roomRequests: { open: number; agreements7d: number };
  sources28d: { source: string; landings: number }[];
  survey: { total: number; very: number; somewhat: number; not: number; comments: { answer: number; comment: string; at: string }[] };
  cost: { monthlyUsd: number; perMauUsd: number | null; perContributorUsd: number | null; mau: number };
};

/** 전체 판단 한 줄 — 신호 중 가장 나쁜 것과 표본 부족 개수로 */
export function overallVerdict(values: BusinessMetrics["values"]): { signal: Signal; text: string } {
  const sigs = Object.values(values).map((v) => v.signal);
  const judged = sigs.filter((s) => s !== "na");
  if (judged.length < 3) {
    return { signal: "na", text: "아직 표본이 적어 판단하기 이릅니다. 숫자보다 추세(그래프가 오르는지)를 보세요." };
  }
  const red = judged.filter((s) => s === "red").length;
  const green = judged.filter((s) => s === "green").length;
  if (red >= 3) return { signal: "red", text: `위험 신호 ${red}개 — 방향 전환이나 핵심 기능 재점검이 필요합니다.` };
  if (red > 0) return { signal: "yellow", text: `위험 신호 ${red}개, 좋음 ${green}개 — 빨간 지표부터 원인을 찾아보세요.` };
  if (green >= judged.length / 2) return { signal: "green", text: `좋음 ${green}개 — 지금 방향을 유지하며 성장에 집중할 때입니다.` };
  return { signal: "yellow", text: `좋음 ${green}개, 주의 ${judged.length - green}개 — 노란 지표를 끌어올릴 실험을 해 보세요.` };
}

export function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

export function signedPct(v: number | null): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

/** 주간 리포트 본문 (메일·웹훅 공용 텍스트) */
export function reportText(m: BusinessMetrics, weekLabel: string, siteUrl: string): { subject: string; text: string } {
  const verdict = overallVerdict(m.values);
  const lines = (Object.keys(METRIC_DEFS) as MetricKey[]).map((k) => {
    const d = METRIC_DEFS[k];
    const v = m.values[k];
    const shown = k === "growth" ? signedPct(v.value) : pct(v.value, 1);
    return `${SIGNAL_ICON[v.signal]} [${d.question}] ${d.label}: ${shown}${v.signal === "na" ? ` (표본 ${v.sample})` : ""}`;
  });
  const last = m.weeks[m.weeks.length - 1];
  const prev = m.weeks[m.weeks.length - 2];
  const wk = last
    ? `지난주 방문자 ${last.visitors.toLocaleString("ko-KR")}명 (${signedPct(prev ? growth(last.visitors, prev.visitors) : null)}), 참여자 ${last.contributors.toLocaleString("ko-KR")}명 (${signedPct(prev ? growth(last.contributors, prev.contributors) : null)}), 글 ${last.posts} · 댓글 ${last.comments}`
    : "";
  const alive = m.rooms.filter((r) => r.authors7d >= 3).map((r) => r.name);
  const text = [
    `노방장 주간 사업 리포트 — ${weekLabel}`,
    "",
    `${SIGNAL_ICON[verdict.signal]} ${verdict.text}`,
    "",
    wk,
    `핵심 작성자(주 2일 이상) ${m.coreThisWeek}명 (4주 전 ${m.coreFourWeeksAgo}명) · 새 참여자 ${m.newContributors7d}명`,
    `살아 있는 방: ${alive.length ? alive.join(", ") : "없음"} · 방 만들기 요청 ${m.roomRequests.open}건 (지난주 동의 ${m.roomRequests.agreements7d})`,
    `설문 '매우 아쉽다' ${m.survey.very}/${m.survey.total}`,
    "",
    ...lines,
    "",
    `자세히: ${siteUrl}/admin/business`,
  ].join("\n");
  return { subject: `[노방장] 주간 리포트 ${weekLabel} — ${SIGNAL_ICON[verdict.signal]} ${SIGNAL_LABEL[verdict.signal]}`, text };
}

/** 월요일 시작 주의 시작일 (KST 날짜 문자열 기준) */
export function weekStart(kstDayStr: string): string {
  const d = new Date(`${kstDayStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 월=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
