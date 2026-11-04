/**
 * 🎯 하루 한 판 게임 재방문 장치 (11/4 대표님 "효과가 나는 조건 5가지 진행", "책·애니·K리그로 진행해").
 * ① 내 분야 지식 게임 ② 하루 한 판(그날 첫 판만 랭킹) ③ 알림(오늘 문제 · 내 기록이 깨짐) ④ 🔥 연속 기록 ⑤ 편 대결.
 * 사람이 적을 때는 전국 순위보다 "상위 x%"와 "어제의 나"를 먼저 보여 준다.
 * 서버·브라우저·테스트 공용 순수 함수.
 */
import { BOOK_TEST } from "./typeTests/book";
import { K_LEAGUE_TEAMS } from "./peers";

export const DAILY_GAMES = ["booksent", "anichosung", "kmatch"] as const;
export type DailyGame = (typeof DAILY_GAMES)[number];
export const isDailyGame = (s: string): s is DailyGame => (DAILY_GAMES as readonly string[]).includes(s);

/** 편: 책은 독서 타입 테스트 결과, 애니는 고른 장르, K리그는 응원 구단 */
export const ANI_GENRES = ["열혈", "일상", "판타지", "로맨스", "SF"] as const;

export type DailyDef = {
  game: DailyGame;
  room: string;
  emoji: string;
  name: string;
  path: string;
  /** "오늘 문제 열렸어요" 알림 시각 (KST HH:MM) */
  pushAt: string;
  /** 편 이름 */
  teamWord: string;
  /** 고를 수 있는 편 (책은 테스트 결과라 고르지 않는다) */
  teams: readonly string[] | null;
  /** 점수가 낮을수록 좋은가 (K리그: 걸린 시간) */
  lowerBetter: boolean;
};

const BOOK_TYPE_NAMES = BOOK_TEST.types.map((t) => `${t.emoji} ${t.name}`);

export const DAILY: Record<DailyGame, DailyDef> = {
  booksent: { game: "booksent", room: "읽는-책-제목을-교환해-보자", emoji: "📖", name: "첫 문장 맞히기", path: "/games/booksent", pushAt: "21:00", teamWord: "독서 타입", teams: null, lowerBetter: false },
  anichosung: { game: "anichosung", room: "애니-만화-덕후방", emoji: "🎨", name: "애니 제목 초성 60초", path: "/games/anichosung", pushAt: "21:00", teamWord: "최애 장르", teams: ANI_GENRES, lowerBetter: false },
  kmatch: { game: "kmatch", room: "k리그-덕후방", emoji: "⚽", name: "구단·홈구장 짝 맞추기", path: "/games/kmatch", pushAt: "20:00", teamWord: "응원 구단", teams: K_LEAGUE_TEAMS, lowerBetter: true },
};

/** 방 → 그 방의 하루 게임 */
export const dailyGameOfRoom = (slug: string): DailyGame | undefined => DAILY_GAMES.find((g) => DAILY[g].room === slug);

/** 책 독서 타입 키 → 편 이름 ("🌧️ 서정파") */
export const bookTeamName = (typeKey: string): string | undefined => {
  const t = BOOK_TEST.types.find((x) => x.key === typeKey);
  return t ? `${t.emoji} ${t.name}` : undefined;
};

export const validTeam = (game: DailyGame, team: string): boolean => {
  const list = DAILY[game].teams ?? BOOK_TYPE_NAMES;
  return list.includes(team);
};

/** 편 순위는 3명 이상인 편만 보여 준다 */
export const MIN_TEAM = 3;
/** 오늘 한 사람이 이보다 적으면 순위보다 "상위 x%"·"어제의 나"를 앞에 */
export const LOW_POP = 20;
/** 🔥 배지는 2일 연속부터 */
export const STREAK_BADGE_MIN = 2;

// ───────── 점수 ─────────

/** 맞힌 개수 게임(책·애니)의 점수 한 숫자 → 맞힌 개수 */
export const correctOf = (score: number): number => Math.floor(score / 10_000);

/** 편 평균·어제의 나 비교에 쓰는 값: 책·애니는 맞힌 개수, K리그는 걸린 초 */
export const primaryValue = (game: DailyGame, score: number): number => (game === "kmatch" ? score / 1000 : correctOf(score));

export const formatPrimary = (game: DailyGame, v: number): string => (game === "kmatch" ? `${v.toFixed(1)}초` : `${Number.isInteger(v) ? v : v.toFixed(1)}개`);

/** 어제의 나와 비교: 좋아진 만큼 양수 (K리그는 줄어든 초가 좋아진 것) */
export function deltaVsYesterday(game: DailyGame, today: number, yesterday: number | null): number | null {
  if (yesterday === null) return null;
  const d = primaryValue(game, today) - primaryValue(game, yesterday);
  const v = DAILY[game].lowerBetter ? -d : d;
  return Math.round(v * 10) / 10;
}

export function deltaText(game: DailyGame, d: number | null): string | null {
  if (d === null) return null;
  if (d === 0) return "어제의 나와 같아요";
  const unit = game === "kmatch" ? `${Math.abs(d).toFixed(1)}초` : `${Math.abs(d)}개`;
  return d > 0 ? `어제의 나보다 ${game === "kmatch" ? `${unit} 빨라요` : `+${unit}`}` : `어제의 나보다 ${game === "kmatch" ? `${unit} 느려요` : `-${unit}`}`;
}

// ───────── 🔥 연속 기록 ─────────

const dayNum = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/**
 * 연속 기록: 랭킹에 들어간 판이 있는 날(KST)이 끊기지 않고 이어진 날 수.
 * 오늘 했으면 오늘까지, 오늘 아직 안 했으면 어제까지 (어제도 안 했으면 0).
 */
export function streakOf(days: readonly string[], today: string): number {
  const set = new Set(days.map(dayNum));
  let d = dayNum(today);
  if (!set.has(d)) d -= 1;
  let n = 0;
  while (set.has(d)) {
    n++;
    d--;
  }
  return n;
}

export const streakBadgeText = (n: number): string | undefined => (n >= STREAK_BADGE_MIN ? `🔥${n}일` : undefined);

// ───────── ⑤ 편 대결 ─────────

export type TeamRow = { team: string; members: number; avg: number };

/** 편마다 사람(이번 주 최고 기록 하나씩)의 평균. 3명 미만인 편은 빼고, 좋은 편 먼저 */
export function teamTable(game: DailyGame, people: readonly { team: string; best: number }[]): TeamRow[] {
  const by = new Map<string, number[]>();
  for (const p of people) by.set(p.team, [...(by.get(p.team) ?? []), primaryValue(game, p.best)]);
  const rows = [...by.entries()]
    .filter(([, vs]) => vs.length >= MIN_TEAM)
    .map(([team, vs]) => ({ team, members: vs.length, avg: Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10 }));
  return rows.sort((a, b) => (DAILY[game].lowerBetter ? a.avg - b.avg : b.avg - a.avg) || b.members - a.members);
}

// ───────── ③ 알림 ─────────

/** "오늘 문제 열렸어요": 정한 시각이 지났고(밤 10시 전), 오늘 아직 안 보냈고, 오늘 아직 안 했을 때 */
export function dailyPushDue(game: DailyGame, hmNow: string, today: string, sentDay: string | null, playedToday: boolean): boolean {
  return hmNow >= DAILY[game].pushAt && hmNow < "22:00" && sentDay !== today && !playedToday;
}

/** "내 기록이 깨졌어요": 하루 한 번, 밤 10시~아침 8시는 보내지 않는다 */
export function beatenPushDue(hmNow: string, today: string, sentDay: string | null): boolean {
  return hmNow >= "08:00" && hmNow < "22:00" && sentDay !== today;
}

export function dailyPushMessage(game: DailyGame, day: string): { title: string; body: string; url: string; tag: string } {
  const g = DAILY[game];
  return { title: `${g.emoji} 오늘의 ${g.name} 문제가 열렸어요`, body: "하루 한 판, 오늘 전국 순위에 도전해요", url: `${g.path}?from=push`, tag: `daily-${game}-${day}` };
}

export function beatenPushMessage(game: DailyGame, day: string, rank: number): { title: string; body: string; url: string; tag: string } {
  const g = DAILY[game];
  return { title: `${g.emoji} 누가 내 기록을 넘었어요`, body: `오늘 ${g.name} 전국 ${rank}위로 내려갔어요. 내일 문제로 다시 올라가 봐요`, url: `/games/rank?game=${game}&from=push`, tag: `beaten-${game}-${day}` };
}
