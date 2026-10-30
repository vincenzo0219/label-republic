/**
 * ⚽ 승부차기 대결 (10/30 대표님 "승부차기 진행해"). 서버·브라우저·테스트 공용 순수 함수.
 * - 한 번씩 번갈아 찬다: 0번째 킥은 A가 차고 B가 막고, 1번째는 B가 차고 A가 막고 … (짝수 = A 슛, 홀수 = B 슛)
 * - 고르는 칸: 0 왼쪽 · 1 가운데 · 2 오른쪽. 슛과 다이브가 같으면 선방, 다르면 골
 * - 5번씩(10킥) 찬 뒤 같으면 서든데스 3번씩(6킥) 더, 그래도 같으면 무승부. 남은 킥으로 못 따라잡으면 그 자리에서 끝
 * - 상대: 10초 안에 사람이 없으면 🤖 노방장 AI (이 판에서 내가 자주 찬 쪽을 조금 더 막고, 덜 막은 쪽으로 조금 더 찬다)
 * - 실력 (10/30 대표님 "게이지 넣어"): 찰 때는 게이지 정확도, 막을 때는 반사신경 타이밍(0~100)
 *   정확도 25 미만이면 빗나감(골키퍼와 상관없이 실패). 방향을 맞혀도 반사신경 40 미만이면 "손끝을 스치고 골"
 */
export type Side = "a" | "b";
export type Pick = 0 | 1 | 2;
export type PkKind = "live" | "ai";

export const PK_REGULAR = 10;
export const PK_SUDDEN = 6;
export const PK_MAX = PK_REGULAR + PK_SUDDEN;
/** 한 번 고르는 시간(초). 지나면 브라우저가 아무 칸이나 고른다 */
export const PK_PICK_SEC = 5;
/** 상대를 기다리는 시간(초). 지나면 🤖 노방장 AI */
export const PK_WAIT_SEC = 10;
/** 상대가 이만큼 고르지 않으면 서버가 대신 아무 칸이나 (나간 사람 때문에 멈추지 않게) */
export const PK_STALL_SEC = 15;
export const PK_AI_NAME = "🤖 노방장 AI";
/** 응원 팀 (이 브라우저에 기억, 팬 테스트 결과 남기기에 적은 팀도 여기로) */
export const PK_TEAM_KEY = "lr:pk:team";
export const PICK_LABEL = ["왼쪽", "가운데", "오른쪽"] as const;
/** 게이지 정확도가 이것보다 낮으면 빗나감 */
export const PK_MISS_UNDER = 25;
/** 방향을 맞혀도 반사신경이 이것보다 낮으면 손끝을 스치고 골 */
export const PK_SAVE_FROM = 40;
/** 게이지·반사신경을 안 눌렀을 때 */
export const PK_SKILL_DEFAULT = 50;
/** 게이지 한 번 지나가는 시간(ms): 라운드마다 조금씩 빨라진다 */
export const gaugeSweepMs = (turn: number) => Math.max(650, Math.round(1100 * 0.94 ** Math.floor(turn / 2)));
/** 0~1 실수 → 0~100 정수 (범위 밖은 자른다, 없으면 50) */
export function skillOf(x: unknown): number {
  if (typeof x !== "number" || !Number.isFinite(x)) return PK_SKILL_DEFAULT;
  return Math.round(Math.min(1, Math.max(0, x)) * 100);
}

export const isPick = (n: unknown): n is Pick => n === 0 || n === 1 || n === 2;
export const shooterOf = (turn: number): Side => (turn % 2 === 0 ? "a" : "b");
export const other = (s: Side): Side => (s === "a" ? "b" : "a");

export type KickResult = "goal" | "save" | "miss" | "graze";
export type Kick = { turn: number; shooter: Side; shot: Pick; dive: Pick; goal: boolean; result: KickResult };
export const RESULT_LABEL: Record<KickResult, string> = { goal: "골!!", save: "선방!", miss: "빗나감!", graze: "손끝을 스치고 골!" };

/** 킥 하나: 빗나감 → 방향 → 반사신경 순서로 */
export function kickResult(shot: number, dive: number, accuracy: number, reflex: number): KickResult {
  if (accuracy < PK_MISS_UNDER) return "miss";
  if (shot !== dive) return "goal";
  return reflex >= PK_SAVE_FROM ? "save" : "graze";
}
export type PkState = { kicks: Kick[]; a: number; b: number; done: boolean; winner: Side | "d" | null; turn: number };

/** 두 사람이 고른 것으로 지금 상태. 둘 다 고른 킥만 센다. 실력 칸이 없으면 50 */
export function pkState(aPicks: readonly number[], bPicks: readonly number[], aSkill: readonly number[] = [], bSkill: readonly number[] = []): PkState {
  const n = Math.min(aPicks.length, bPicks.length, PK_MAX);
  const kicks: Kick[] = [];
  let a = 0;
  let b = 0;
  for (let t = 0; t < n; t++) {
    const shooter = shooterOf(t);
    const shot = (shooter === "a" ? aPicks[t] : bPicks[t]) as Pick;
    const dive = (shooter === "a" ? bPicks[t] : aPicks[t]) as Pick;
    const acc = (shooter === "a" ? aSkill[t] : bSkill[t]) ?? PK_SKILL_DEFAULT;
    const ref = (shooter === "a" ? bSkill[t] : aSkill[t]) ?? PK_SKILL_DEFAULT;
    const result = kickResult(shot, dive, acc, ref);
    const goal = result === "goal" || result === "graze";
    kicks.push({ turn: t, shooter, shot, dive, goal, result });
    if (goal) shooter === "a" ? a++ : b++;
    const over = decided(t + 1, a, b);
    if (over) return { kicks, a, b, done: true, winner: over, turn: t + 1 };
  }
  return { kicks, a, b, done: false, winner: null, turn: n };
}

/** 킥 played 개가 끝났을 때 승부가 났는지 */
function decided(played: number, a: number, b: number): Side | "d" | null {
  if (played <= PK_REGULAR) {
    // 남은 정규 킥으로 따라잡을 수 없으면 끝
    let aLeft = 0;
    let bLeft = 0;
    for (let t = played; t < PK_REGULAR; t++) shooterOf(t) === "a" ? aLeft++ : bLeft++;
    if (a > b + bLeft) return "a";
    if (b > a + aLeft) return "b";
    if (played === PK_REGULAR) return a === b ? null : a > b ? "a" : "b";
    return null;
  }
  // 서든데스: 한 쌍(A·B 한 번씩)이 끝날 때마다
  if ((played - PK_REGULAR) % 2 !== 0) return null;
  if (a !== b) return a > b ? "a" : "b";
  return played >= PK_MAX ? "d" : null;
}

/** 내 쪽에서 본 결과 */
export const outcomeFor = (s: PkState, me: Side): "win" | "lose" | "draw" | null =>
  !s.done ? null : s.winner === "d" ? "draw" : s.winner === me ? "win" : "lose";

/**
 * 🤖 노방장 AI가 고르는 칸 (사람이 이번 킥에 고른 것은 보지 않는다, 지난 킥만).
 * 막을 때: 사람이 이 판에서 가장 많이 찬 쪽을 절반 확률로, 나머지는 아무 칸.
 * 찰 때: 사람이 가장 덜 막은(다이브한) 쪽을 절반 확률로, 나머지는 아무 칸. 일부러 완벽하지 않게.
 */
export function aiPick(humanPicks: readonly number[], turn: number, human: Side, rnd: () => number = Math.random): Pick {
  const random = () => Math.min(2, Math.floor(rnd() * 3)) as Pick;
  const aiShoots = shooterOf(turn) !== human;
  const counts = [0, 0, 0];
  let seen = 0;
  for (let t = 0; t < Math.min(turn, humanPicks.length); t++) {
    const humanShot = shooterOf(t) === human;
    // AI가 막을 차례면 사람이 찬 기록, AI가 찰 차례면 사람이 막은 기록
    if (humanShot !== aiShoots) {
      counts[humanPicks[t]!]!++;
      seen++;
    }
  }
  if (!seen || rnd() >= 0.5) return random();
  if (!aiShoots) return counts.indexOf(Math.max(...counts)) as Pick;
  return counts.indexOf(Math.min(...counts)) as Pick;
}

/**
 * 🤖 노방장 AI 실력: 찰 때 정확도는 8%쯤 빗나가게, 막을 때 반사신경은 30~100 고르게(방향 맞히면 약 86% 선방).
 * 처음 값(12% · 20~100)은 타이밍 좋은 사람이 70% 이겨서, 모의 대결로 60%쯤 이기게 맞췄다
 */
export function aiSkill(aiShoots: boolean, rnd: () => number = Math.random): number {
  if (aiShoots) return rnd() < 0.08 ? Math.floor(rnd() * PK_MISS_UNDER) : PK_MISS_UNDER + Math.floor(rnd() * (101 - PK_MISS_UNDER));
  return 30 + Math.floor(rnd() * 71);
}

/** 응원 팀 이름 맞추기: 앞뒤 공백·대소문자·띄어쓰기·FC 무시 ("FC서울" = "서울 fc" = "서울") */
export function teamKey(team: string | null | undefined): string {
  return (team ?? "").trim().toLowerCase().replace(/\s+/g, "").replace(/fc/g, "");
}

export const cleanTeam = (team: unknown): string | null => {
  if (typeof team !== "string") return null;
  const t = team.replace(/\s+/g, " ").trim().slice(0, 20);
  return t ? t : null;
};

/** 이번 주 월요일(KST) 날짜 */
export function kstWeekStart(now = new Date()): string {
  const k = new Date(now.getTime() + 9 * 3600_000);
  const dow = (k.getUTCDay() + 6) % 7; // 월 0 … 일 6
  return new Date(k.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}

export const pkShareText = (my: number, op: number, result: "win" | "lose" | "draw", team: string | null) =>
  `⚽ 승부차기 ${my}:${op} ${result === "win" ? "승리!" : result === "draw" ? "무승부!" : "아쉬운 패배"}${team ? ` ${team} 팬으로 ${result === "win" ? "이겼어요" : "찼어요"}` : ""}`;
