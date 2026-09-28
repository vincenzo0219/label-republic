/**
 * 제품 리뉴얼(배합·스펙 변경) 감지 (Sprint 25) — 서버·클라이언트 공용 순수 함수.
 *
 * 같은 제품·항목·기준의 "표시값(라벨)"을 글이 올라온 시각 순으로 늘어놓고, 값이 한 번 바뀐 뒤 계속 새 값으로 제보되면
 * 그 지점을 리뉴얼로 본다. 운영자가 판단하지 않는다 — 아래 규칙이 전부이고, 제보 수 기준(renewal_min_reports)은
 * 커뮤니티 규칙 투표로 바뀐다.
 *
 *   - 값이 2% 안으로 같으면 같은 값 (반올림·표기 차이)
 *   - 구간을 나누는 조건: 각 구간에서 대표 값이 3/4 이상 (옛 재고 제보가 조금 섞여도 됨)
 *     · 새 값은 서로 다른 작성자 minReports 명 이상이 제보
 *     · 옛 값은 2명 이상이거나 사진 근거가 있어야 함 (한 명의 오타를 "옛 라벨"로 보지 않기 위해)
 *   - 최근 제보가 지금 값과 다르지만 아직 기준 수에 못 미치면 "확인 중" (pending) — 다른 이용자에게 라벨 확인을 부탁한다
 *   - 두 값이 시간 순으로 나뉘지 않고 섞여 있으면(지역·판매처별 버전 등) 나누지 않는다
 */

/** 이 비율 안으로 가까우면 같은 값 */
export const SAME_TOLERANCE = 0.02;
/** 구간 안에서 대표 값이 차지해야 하는 비율 */
export const ERA_PURITY = 0.75;
export const DEFAULT_MIN_REPORTS = 2;
export const MAX_DETECT_REPORTS = 300;

export type LabelReport = {
  post_id: string;
  /** 글이 올라온 시각 (ms) */
  at: number;
  /** 기준 단위 값 (mg·ml·mm·Hz, 그 밖은 단위 그대로) */
  base: number;
  /** 작성자 식별값 — 없으면 글마다 다른 사람으로 본다 */
  author: string | null;
  photo: boolean;
};

export type Era = {
  /** 이 구간의 대표 값 (같은 값 묶음의 중앙값) */
  base: number;
  /** 대표 값 제보 수·작성자 수·사진 근거 수 */
  n: number;
  authors: number;
  photos: number;
  /** 구간 안의 다른 값 제보 (옛 재고 등) */
  stray: number;
  /** 대표 값 첫·마지막 제보 시각 */
  first_at: number;
  last_at: number;
  /** 구간 시작 (이 시각 이후 글이 이 구간) */
  start_at: number;
  post_ids: string[];
};

export type PendingChange = {
  from: number;
  to: number;
  n: number;
  authors: number;
  photos: number;
  first_at: number;
  post_ids: string[];
};

export type EraResult = { eras: Era[]; pending: PendingChange | null };

export function sameValue(a: number, b: number): boolean {
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m === 0 || Math.abs(a - b) <= m * SAME_TOLERANCE;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** 값을 가까운 것끼리 묶는다 (정렬 후 첫 값 기준 2% 안) → 제보마다 묶음 번호 */
function clusterIds(reports: LabelReport[]): number[] {
  const order = reports.map((r, i) => ({ v: r.base, i })).sort((a, b) => a.v - b.v);
  const ids = new Array<number>(reports.length);
  let cluster = -1;
  let start = Number.NaN;
  for (const { v, i } of order) {
    if (cluster < 0 || !sameValue(start, v)) {
      cluster++;
      start = v;
    }
    ids[i] = cluster;
  }
  return ids;
}

type Item = LabelReport & { c: number };

function authorsOf(items: Item[]): number {
  return new Set(items.map((r) => r.author ?? `post:${r.post_id}`)).size;
}

/** 가장 많이 제보된 묶음 (같으면 작성자 많은 쪽, 그다음 먼저 제보된 값 — 새 값은 기준을 넘어야 인정되므로) */
function modeCluster(items: Item[]): number {
  const by = new Map<number, Item[]>();
  for (const r of items) by.set(r.c, [...(by.get(r.c) ?? []), r]);
  return [...by.entries()].sort(
    (a, b) => b[1].length - a[1].length || authorsOf(b[1]) - authorsOf(a[1]) || a[1][0]!.at - b[1][0]!.at,
  )[0]![0];
}

function eraOf(items: Item[]): Era & { c: number } {
  const c = modeCluster(items);
  const mine = items.filter((r) => r.c === c);
  return {
    c,
    base: median(mine.map((r) => r.base)),
    n: mine.length,
    authors: authorsOf(mine),
    photos: mine.filter((r) => r.photo).length,
    stray: items.length - mine.length,
    first_at: mine[0]!.at,
    last_at: mine[mine.length - 1]!.at,
    start_at: items[0]!.at,
    post_ids: mine.map((r) => r.post_id),
  };
}

/** 옛 값이 믿을 만한가: 서로 다른 작성자 2명 이상이거나 사진 근거가 있다 (한 명의 오타를 "옛 라벨"로 보지 않기 위해) */
const OLD_MIN_AUTHORS = 2;
function established(items: Item[]): boolean {
  return authorsOf(items) >= OLD_MIN_AUTHORS || items.some((r) => r.photo);
}

/** 구간을 하나 더 나눌 때의 비용 — 다른 값 제보 한두 개로 구간을 잘게 쪼개지 않게 */
const SPLIT_COST = 0.5;

type Seg = { m: number; cnt: number; pure: boolean; authors: number; est: boolean };

/**
 * 시각 순 제보를 구간으로 나누는 가장 좋은 방법 (동적 계획법, O(n²·값 종류)).
 * 점수 = 각 구간에서 대표 값과 맞는 제보 수 − 구간 수 × SPLIT_COST. 두 번째 구간부터는
 *   대표 값이 앞 구간과 다르고, 구간 첫 제보가 대표 값이며(앞 구간의 마지막 제보도 앞 대표 값), 대표 값 비율 ERA_PURITY 이상,
 *   새 값 작성자 min 명 이상, 앞 구간이 믿을 만해야(established) 한다.
 */
function bestSegmentation(items: Item[], min: number): [number, number][] {
  const n = items.length;
  // seg[i][j-i-1] = items[i, j) 의 통계
  const seg: Seg[][] = [];
  for (let i = 0; i < n; i++) {
    const counts = new Map<number, number>();
    const authors = new Map<number, Set<string>>();
    const photo = new Set<number>();
    let m = items[i]!.c;
    const row: Seg[] = [];
    for (let j = i; j < n; j++) {
      const r = items[j]!;
      counts.set(r.c, (counts.get(r.c) ?? 0) + 1);
      authors.set(r.c, (authors.get(r.c) ?? new Set()).add(r.author ?? `post:${r.post_id}`));
      if (r.photo) photo.add(r.c);
      if (counts.get(r.c)! > counts.get(m)!) m = r.c;
      const cnt = counts.get(m)!;
      const a = authors.get(m)!.size;
      row.push({ m, cnt, pure: cnt / (j - i + 1) >= ERA_PURITY, authors: a, est: a >= OLD_MIN_AUTHORS || photo.has(m) });
    }
    seg.push(row);
  }
  type State = { score: number; prev: number; prevM: number; est: boolean };
  // dp[j]: items[0, j) 를 나눴을 때 마지막 구간 대표 값 → 최고 점수
  const dp: Map<number, State>[] = Array.from({ length: n + 1 }, () => new Map());
  for (let j = 1; j <= n; j++) {
    const s = seg[0]![j - 1]!;
    if (s.pure) dp[j]!.set(s.m, { score: s.cnt, prev: 0, prevM: -1, est: s.est });
  }
  for (let i = 1; i < n; i++) {
    for (const [p, st] of dp[i]!) {
      if (!st.est || items[i - 1]!.c !== p) continue;
      for (let j = i + 1; j <= n; j++) {
        const s = seg[i]![j - i - 1]!;
        if (s.m === p || !s.pure || items[i]!.c !== s.m || s.authors < min) continue;
        const score = st.score + s.cnt - SPLIT_COST;
        const cur = dp[j]!.get(s.m);
        if (!cur || score > cur.score) dp[j]!.set(s.m, { score, prev: i, prevM: p, est: s.est });
      }
    }
  }
  // 나누지 않는 경우(대표 값 비율과 상관없이 항상 가능)가 기준
  let best: { score: number; m: number } | null = null;
  for (const [m, st] of dp[n]!) if (!best || st.score > best.score) best = { score: st.score, m };
  if (!best || best.score <= seg[0]![n - 1]!.cnt) return [[0, n]];
  const ranges: [number, number][] = [];
  let j = n;
  let m = best.m;
  while (j > 0) {
    const st = dp[j]!.get(m)!;
    ranges.unshift([st.prev, j]);
    j = st.prev;
    m = st.prevM;
  }
  return ranges;
}

/**
 * 표시값 제보(시각 순이 아니어도 됨)를 구간으로 나눈다. 구간이 하나면 리뉴얼 없음.
 * minReports: 새 값을 인정하는 서로 다른 작성자 수 (커뮤니티 규칙 renewal_min_reports)
 */
export function detectEras(reports: LabelReport[], minReports = DEFAULT_MIN_REPORTS): EraResult {
  if (!reports.length) return { eras: [], pending: null };
  const min = Math.max(2, Math.round(minReports));
  const ids = clusterIds(reports);
  const items: Item[] = reports
    .map((r, i) => ({ ...r, c: ids[i]! }))
    .sort((a, b) => a.at - b.at || Number(a.post_id) - Number(b.post_id))
    // 계산량(n²) 상한 — 제보가 아주 많은 항목은 최근 것만 본다
    .slice(-MAX_DETECT_REPORTS);
  const ranges = bestSegmentation(items, min);
  const merged = ranges.map(([a, b]) => ({ ...eraOf(items.slice(a, b)), range: [a, b] as const }));

  // 구간이 둘 이상이면 새 구간의 시작은 새 값 첫 제보 (segment 가 그렇게 자른다)
  const eras: Era[] = merged.map(({ c: _c, range: _r, ...e }) => e);

  // 확인 중: 끝에서부터 이어진, 지금 구간과 다른 같은 값 제보
  const last = merged[merged.length - 1]!;
  const lastItems = items.slice(last.range[0], last.range[1]);
  let pending: PendingChange | null = null;
  const tail: Item[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const r = items[i]!;
    if (r.c === last.c || (tail.length && r.c !== tail[0]!.c)) break;
    tail.unshift(r);
  }
  if (tail.length && established(lastItems.filter((r) => r.c === last.c))) {
    pending = {
      from: last.base,
      to: median(tail.map((r) => r.base)),
      n: tail.length,
      authors: authorsOf(tail),
      photos: tail.filter((r) => r.photo).length,
      first_at: tail[0]!.at,
      post_ids: tail.map((r) => r.post_id),
    };
  }
  return { eras, pending };
}

/** 리뉴얼 한 건: 앞 구간 → 뒤 구간 */
export type Renewal = {
  from: number;
  to: number;
  /** 옛 값 마지막 제보 ~ 새 값 첫 제보 사이에 바뀜 */
  last_old_at: number;
  first_new_at: number;
  new_n: number;
  new_authors: number;
  new_photos: number;
};

export function renewalsOf(eras: Era[]): Renewal[] {
  return eras.slice(1).map((e, i) => ({
    from: eras[i]!.base,
    to: e.base,
    last_old_at: eras[i]!.last_at,
    first_new_at: e.first_at,
    new_n: e.n,
    new_authors: e.authors,
    new_photos: e.photos,
  }));
}

/** 바뀐 폭 (%) */
export function changePct(from: number, to: number): number | null {
  return from > 0 ? ((to - from) / from) * 100 : null;
}

const YM = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric" });
function ym(ms: number): { y: number; m: number } {
  const parts = YM.formatToParts(new Date(ms));
  return { y: Number(parts.find((p) => p.type === "year")!.value), m: Number(parts.find((p) => p.type === "month")!.value) };
}

/** "옛 값 마지막 제보 ~ 새 값 첫 제보" 를 달 단위로: "2026년 3월", "2026년 3월~5월 사이", "2025년 12월~2026년 2월 사이" */
export function changePeriodText(lastOldAt: number, firstNewAt: number): string {
  const a = ym(lastOldAt);
  const b = ym(firstNewAt);
  if (a.y === b.y && a.m === b.m) return `${a.y}년 ${a.m}월`;
  if (a.y === b.y) return `${a.y}년 ${a.m}월~${b.m}월 사이`;
  return `${a.y}년 ${a.m}월~${b.y}년 ${b.m}월 사이`;
}
