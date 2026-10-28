/**
 * 🎯 행사 빙고 (10/28 대표님 "행사빙고 만들어줘"): 미혼남녀방에서 행사만 훑고 나가지 않게, 행사를 하나씩 열어 볼 이유를 준다.
 * 칸마다 조건이 있고, 그 조건에 맞는 행사의 상세(/singles/<번호>)를 열면 칸이 채워진다. 가운데 칸은 💬 썸 시뮬레이터.
 * 조건은 운영자가 원문으로 확인해 넣은 행사 정보(singlesEvents)로만 판정한다. 기록은 이 브라우저(localStorage)에만.
 */
import { eventStatus, type SinglesEvent } from "./singlesEvents";

export const BINGO_SEEN_KEY = "lr:singlesSeen";
export const BINGO_SIM_KEY = "lr:simDone";

export type BingoCell = { key: string; emoji: string; label: string; test: ((e: SinglesEvent, today: string) => boolean) | null };

const CAPITAL = ["서울", "경기", "인천"];
const GYEONGSANG = ["경남", "경북", "부산", "대구", "울산"];
const overnight = (e: SinglesEvent) => (!!e.eventEnd && !!e.eventDate && e.eventEnd > e.eventDate) || /[12]박\s?[23]일/.test(`${e.title} ${e.notes}`);
const smallQuota = (e: SinglesEvent) => e.quotaMale !== null && e.quotaFemale !== null && Math.max(e.quotaMale, e.quotaFemale) > 0 && Math.max(e.quotaMale, e.quotaFemale) <= 15;

/** 3×3, 가운데(4번)는 썸 시뮬레이터 */
export const BINGO_CELLS: BingoCell[] = [
  { key: "capital", emoji: "🏙", label: "수도권 행사", test: (e) => CAPITAL.includes(e.sido) },
  { key: "temple", emoji: "🛕", label: "사찰·공공 행사", test: (e) => e.organizerType === "temple" || e.organizerType === "public" },
  { key: "south", emoji: "🌊", label: "경상도 행사", test: (e) => GYEONGSANG.includes(e.sido) },
  { key: "overnight", emoji: "🏕", label: "1박 이상 여행형", test: overnight },
  { key: "sim", emoji: "💬", label: "썸 시뮬레이터", test: null },
  { key: "lottery", emoji: "🎲", label: "추첨·심사로 뽑아요", test: (e) => /추첨|심사|인터뷰/.test(e.selection) },
  { key: "small", emoji: "👥", label: "남녀 각 15명 이하", test: smallQuota },
  { key: "open", emoji: "⏰", label: "지금 접수 중", test: (e, today) => eventStatus(e, today) === "open" },
  { key: "free", emoji: "🆓", label: "참가비 0원", test: (e) => e.fee === 0 },
];

export const BINGO_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** 칸마다 채워졌는지: 본 행사 중 그 조건에 맞는 것이 있으면 */
export function bingoFilled(events: SinglesEvent[], seen: Set<string>, simDone: boolean, today: string): boolean[] {
  const viewed = events.filter((e) => seen.has(e.id));
  return BINGO_CELLS.map((c) => (c.test ? viewed.some((e) => c.test!(e, today)) : simDone));
}

export const bingoLines = (filled: boolean[]): number => BINGO_LINES.filter((l) => l.every((i) => filled[i])).length;

/** 이 칸을 채울 수 있는 행사 (접수 중 먼저, 최대 3개) */
export function bingoCandidates(cell: BingoCell, events: SinglesEvent[], today: string): SinglesEvent[] {
  if (!cell.test) return [];
  const rank = (e: SinglesEvent) => (eventStatus(e, today) === "open" ? 0 : 1);
  return events.filter((e) => cell.test!(e, today)).sort((a, b) => rank(a) - rank(b)).slice(0, 3);
}
