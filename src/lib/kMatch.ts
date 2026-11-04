/**
 * ⚽ K리그 구단·홈구장 짝 맞추기 (11/4 대표님 "책·애니·K리그로 진행해").
 * 하루 한 판, 전국이 같은 6개 구단: 구단을 누르고 그 구단 홈구장을 누른다. 다 맞히는 데 걸린 시간 + 틀릴 때마다 3초.
 * 짧을수록 위. 끝나면 이번 주말 경기 예측으로 이어진다.
 *
 * ★ 2026시즌 K리그1 12개 구단과 홈구장 (11/4 웹 검색으로 대조: 2026시즌 경기 기사·일정표에 나온 경기장).
 *   - 강원FC: 2026시즌 리그 홈경기는 강릉 하이원아레나 (2025년 8월 구단 발표).
 *   - 광주FC: 2025년 3월 광주월드컵경기장으로 홈경기장 이전.
 *   - 포항: 9월 안전 점검 기간 두 경기는 상주에서 열렸지만 홈구장은 스틸야드.
 * 서버·브라우저·테스트 공용 순수 함수.
 */

export type KClub = { club: string; team: string; city: string; stadium: string };

export const K_CLUBS: readonly KClub[] = [
  { club: "전북 현대", team: "전북", city: "전주", stadium: "전주월드컵경기장" },
  { club: "울산 HD", team: "울산", city: "울산", stadium: "울산문수축구경기장" },
  { club: "포항 스틸러스", team: "포항", city: "포항", stadium: "포항스틸야드" },
  { club: "FC서울", team: "FC서울", city: "서울", stadium: "서울월드컵경기장" },
  { club: "강원FC", team: "강원", city: "강릉", stadium: "강릉 하이원아레나" },
  { club: "대전하나시티즌", team: "대전", city: "대전", stadium: "대전월드컵경기장" },
  { club: "김천 상무", team: "김천", city: "김천", stadium: "김천종합운동장" },
  { club: "제주SK", team: "제주", city: "제주", stadium: "제주월드컵경기장" },
  { club: "광주FC", team: "광주", city: "광주", stadium: "광주월드컵경기장" },
  { club: "FC안양", team: "안양", city: "안양", stadium: "안양종합운동장" },
  { club: "인천 유나이티드", team: "인천", city: "인천", stadium: "인천축구전용경기장" },
  { club: "부천FC1995", team: "부천", city: "부천", stadium: "부천종합운동장" },
];

export const KMATCH_PER_DAY = 6;
/** 틀릴 때마다 더하는 시간 */
export const KMATCH_PENALTY_MS = 3000;
/** 6쌍을 1.5초 안에 다 맞힐 수는 없다 */
export const KMATCH_MIN_MS = 1500;
export const KMATCH_MAX_MS = 600_000;
export const KMATCH_MAX_WRONG = 60;
export const KMATCH_START = "2026-11-05";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function kmatchDayNumber(day: string): number {
  return Math.max(0, Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${KMATCH_START}T00:00:00Z`)) / 86_400_000));
}

export type KMatchBoard = { clubs: string[]; stadiums: string[] };

/** 그날 판 (전국 같음): 구단 6개 + 그 홈구장 6개를 따로 섞은 순서 */
export function kmatchBoard(day: string): KMatchBoard {
  const n = kmatchDayNumber(day);
  const picked = shuffled(K_CLUBS, 97_531 * (n + 1)).slice(0, KMATCH_PER_DAY);
  return { clubs: picked.map((c) => c.club), stadiums: shuffled(picked, 13_579 * (n + 1) + 7).map((c) => c.stadium) };
}

export const stadiumOf = (club: string): string | undefined => K_CLUBS.find((c) => c.club === club)?.stadium;
export const isPair = (club: string, stadium: string): boolean => stadiumOf(club) === stadium;

/** 점수 = 걸린 시간 + 틀린 수 × 3초 (ms, 짧을수록 좋다) */
export const kmatchScore = (ms: number, wrong: number): number =>
  Math.min(KMATCH_MAX_MS, Math.max(KMATCH_MIN_MS, Math.round(ms)) + Math.max(0, Math.min(KMATCH_MAX_WRONG, wrong)) * KMATCH_PENALTY_MS);

export const formatKMatchScore = (score: number): string => `${(score / 1000).toFixed(1)}초`;
