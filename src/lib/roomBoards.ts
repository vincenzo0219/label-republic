/**
 * 🧩 방 놀이 탭 2단계 (11/2 대표님 "다시 오게", "사람이 같이 있어야 의미가 생기는" 것 "전부 다 진행").
 * 몇 개의 공용 엔진을 설정으로만 방에 붙인다. 화면은 src/components/roomBoards, 저장소는 src/lib/repo/roomBoards.ts, 표 122.
 *
 * - log    📒 방 기록판: 하루(또는 한 달)에 숫자·체크·칩·지역·짧은 제목 하나씩 → 내 연속 + 이번 주(달) 방 합계·평균 + 내 위치
 * - photo  📸 주간 사진 투표: 한 주 한 장, ❤️ 한 사진에 한 번, 금요일 밤 9시(KST) 1등 발표 → 1등 닉네임에 "🏆 이번 주 1등" 배지 한 주
 * - vote   🤔 살까 말까 / 할까 말까: 방 안에서 올리고 48시간 투표
 * - pick   🌱 매일 퀴즈(정답 있음) · 🍷 주간 투표(정해진 목록)
 * - rating ⭐ 별점판 · 🔐 성공/실패 기록판: 항목마다 한 사람 한 점수, 3명부터 평균
 * - pet    🐶 생일·입양일 달력: 이름 + 월/일만, 오늘 생일인 아이에게 🎉
 *
 * 숫자는 실제로 센 값만. 평균·위치는 사람이 적으면 숨긴다. 주간 초기화는 모두 KST 기준 순수 함수 (아래).
 */
import { weekStart } from "./predictions";

/** 한국 시간 날짜 YYYY-MM-DD (metrics.kstDay 와 같음. 화면에서도 쓰려고 여기 둔다) */
const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 설정

type Base = {
  key: string;
  room: string;
  emoji: string;
  title: string;
  /** 한 줄 설명 (무엇을 하는지) */
  sub: string;
  /** 다시 올 이유 (카드 맨 아래 한 줄) */
  why: string;
  adult?: boolean;
};

export type LogBoard = Base & {
  kind: "log";
  input: "number" | "check" | "chips" | "select" | "text";
  /** day: 하루 한 번(이번 주 합계), month: 한 달 한 번(이번 달 합계) */
  period: "day" | "month";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  /** 칩: 한 번에 고르는 잔 수 등 최댓값 */
  countMax?: number;
  /** 한 기간에 남길 수 있는 항목 수 (칩·지역·제목) */
  perPeriod?: number;
  /** 내 위치(상위 n%)·순위를 보일지 */
  rank?: boolean;
  /** 합계 문장에 쓰는 말 ("합쳐 412km") */
  totalWord?: string;
  placeholder?: string;
};

export type PhotoBoard = Base & { kind: "photo"; prompt: string };
export type VoteBoard = Base & { kind: "vote"; yes: string; no: string; titleHint: string; priceHint: string };
export type PickBoard = Base & { kind: "pick"; mode: "quiz" | "vote"; period: "day" | "week"; options: readonly string[] };
export type RatingBoard = Base & { kind: "rating"; scale: "stars" | "result"; period: "quarter" | "all"; labelHint: string };
export type PetBoard = Base & { kind: "pet" };

export type RoomBoard = LogBoard | PhotoBoard | VoteBoard | PickBoard | RatingBoard | PetBoard;

export const COFFEE_CHIPS = ["아메리카노", "라떼", "핸드드립", "디카페인", "콜드브루", "에스프레소", "기타"] as const;
export const REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"] as const;
export const WINE_NOTES = ["체리", "블랙베리", "자두", "시트러스", "사과", "복숭아", "꽃", "허브", "후추", "바닐라", "오크", "토스트", "초콜릿", "캐러멜", "꿀", "스모키", "피트", "흙내음", "가죽", "견과"] as const;

const B = <T extends RoomBoard>(b: T): T => b;

export const ROOM_BOARDS: Record<string, RoomBoard> = Object.fromEntries(
  [
    // A 📒 방 기록판
    B({ key: "run-km", kind: "log", room: "러닝-덕후방", emoji: "🏃", title: "러닝 기록판", sub: "오늘 달린 거리를 남기면 방 사람들과 이번 주 합계를 봐요.", why: "이번 주 합계는 월요일에 초기화돼요.", input: "number", period: "day", unit: "km", min: 0.1, max: 100, step: 0.1, rank: true, totalWord: "달린 거리", placeholder: "5.2" }),
    B({ key: "book-pages", kind: "log", room: "읽는-책-제목을-교환해-보자", emoji: "📚", title: "읽은 쪽수 기록판", sub: "오늘 읽은 쪽수를 남겨요. 이번 달 방 합계와 내 위치가 보여요.", why: "이번 달 합계는 1일에 초기화돼요.", input: "number", period: "day", unit: "쪽", min: 1, max: 1000, step: 1, rank: true, totalWord: "읽은 쪽수", placeholder: "30" }),
    B({ key: "savings-done", kind: "log", room: "적립식-투자방", emoji: "💰", title: "이번 달 적립 완료 체크", sub: "이번 달 적립을 했으면 체크해요. 금액·종목은 받지 않아요.", why: "다음 달 1일에 새 칸이 열려요.", input: "check", period: "month" }),
    B({ key: "coffee-cups", kind: "log", room: "커피-덕후방", emoji: "☕", title: "오늘의 커피 한 줄", sub: "오늘 마신 커피를 골라요. 이번 주 방에서 많이 마신 커피가 보여요.", why: "이번 주 집계는 월요일에 초기화돼요.", input: "chips", period: "day", options: COFFEE_CHIPS, countMax: 5, unit: "잔", totalWord: "마신 커피" }),
    B({ key: "yoga-mat", kind: "log", room: "요가-필라테스-덕후방", emoji: "🧘", title: "오늘 매트 깔았어요", sub: "수련한 날 한 번 눌러요. 연속 일수가 쌓여요.", why: "내일 다시 누르면 연속이 이어져요.", input: "check", period: "day", unit: "일", totalWord: "수련한 날" }),
    B({ key: "camping-region", kind: "log", room: "캠핑-덕후방", emoji: "⛺", title: "이번 달 다녀온 지역", sub: "이번 달 캠핑 다녀온 시·도를 골라요. 방 사람들이 많이 간 곳이 보여요.", why: "이번 달 지도는 1일에 초기화돼요.", input: "select", period: "month", options: REGIONS, perPeriod: 5 }),
    B({ key: "stage-seen", kind: "log", room: "뮤지컬-연극-덕후방", emoji: "🎭", title: "이번 달 본 공연", sub: "본 공연 제목을 남겨요. 방에서 많이 본 공연 순으로 보여요.", why: "이번 달 목록은 1일에 초기화돼요.", input: "text", period: "month", perPeriod: 10, placeholder: "공연 제목 (30자까지)" }),
    // B 📸 주간 사진 투표
    B({ key: "viv-photo", kind: "photo", room: "비바리움-덕후방", emoji: "🦎", title: "이번 주 우리 장 자랑", sub: "사육장 사진 한 장. 마음에 드는 장에 ❤️를 눌러요.", prompt: "우리 장 사진 올리기", why: "금요일 밤 9시에 1등을 발표해요." }),
    B({ key: "cat-photo", kind: "photo", room: "고양이-집사방", emoji: "🐱", title: "오늘의 자는 자리", sub: "우리 냥이가 자는 자리 사진 한 장. 귀여운 자리에 ❤️를 눌러요.", prompt: "자는 자리 사진 올리기", why: "금요일 밤 9시에 1등을 발표해요." }),
    B({ key: "shoe-photo", kind: "photo", room: "신발-덕후방", emoji: "👟", title: "오늘 신은 신발", sub: "오늘 신은 신발 사진 한 장. 마음에 드는 착장에 ❤️를 눌러요.", prompt: "신발 사진 올리기", why: "금요일 밤 9시에 1등을 발표해요." }),
    // C 🤔 살까 말까 / 할까 말까
    B({ key: "shoe-vote", kind: "vote", room: "신발-덕후방", emoji: "👟", title: "발매 신발 살까 말까", sub: "고민되는 신발을 올리면 방 사람들이 48시간 동안 투표해요.", yes: "🛒 산다", no: "🙅 참는다", titleHint: "신발 이름 (40자까지)", priceHint: "발매가 (원, 선택)", why: "48시간 뒤 결과가 나와요." }),
    B({ key: "shop-vote", kind: "vote", room: "오늘도-장사중", emoji: "🏪", title: "이 메뉴 가격 올릴까?", sub: "사장님들께 물어봐요. 48시간 동안 투표해요.", yes: "⬆️ 올린다", no: "✋ 그대로", titleHint: "메뉴 이름 (40자까지)", priceHint: "지금 가격 (원, 선택)", why: "48시간 뒤 결과가 나와요." }),
    B({ key: "coffee-vote", kind: "vote", room: "커피-덕후방", emoji: "☕", title: "이 원두·머신 살까?", sub: "고민되는 원두나 머신을 올려요. 48시간 동안 투표해요.", yes: "🛒 산다", no: "🙅 참는다", titleHint: "원두·머신 이름 (40자까지)", priceHint: "가격 (원, 선택)", why: "48시간 뒤 결과가 나와요." }),
    // E 매일 퀴즈 · 주간 투표 · 별점판 · 기록판 · 달력
    B({ key: "vegan-quiz", kind: "pick", mode: "quiz", period: "day", room: "비건-덕후방", emoji: "🌱", title: "이 성분 동물성일까?", sub: "하루 한 문제. 성분표에서 자주 보는 이름이에요.", options: ["동물성", "동물성 아님"], why: "내일 새 문제가 나와요." }),
    B({ key: "wine-note", kind: "pick", mode: "vote", period: "week", room: "와인-위스키-덕후방", emoji: "🍷", title: "이번 주 향 한 단어", sub: "이번 주 마신 술에서 느낀 향을 하나 골라요. 만 19세 이상만 참여해 주세요.", options: WINE_NOTES, why: "월요일에 새 투표가 열려요.", adult: true }),
    B({ key: "escape-log", kind: "rating", scale: "result", period: "all", room: "보드게임-방탈출-덕후방", emoji: "🔐", title: "방탈출 성공 기록판", sub: "다녀온 테마와 성공·실패를 남겨요. 테마별 성공률이 보여요.", labelHint: "테마 이름 (30자까지)", why: "기록이 3개 모이면 그 테마 성공률이 열려요." }),
    B({ key: "anime-stars", kind: "rating", scale: "stars", period: "quarter", room: "애니-만화-덕후방", emoji: "⭐", title: "이번 분기 신작 별점판", sub: "본 신작에 별점을 남겨요. 3명부터 방 평균이 보여요.", labelHint: "작품 제목 (30자까지)", why: "분기가 바뀌면 새 별점판이 열려요." }),
    B({ key: "dog-days", kind: "pet", room: "반려견-덕후방", emoji: "🐶", title: "우리 아이 생일·입양일 달력", sub: "이름과 월·일만 남겨요. 사진·연도는 받지 않아요.", why: "오늘 생일인 아이가 있으면 맨 위에 떠요." }),
  ].map((b) => [b.key, b]),
);

export const boardOf = (key: string | null | undefined): RoomBoard | undefined => (key && Object.hasOwn(ROOM_BOARDS, key) ? ROOM_BOARDS[key] : undefined);
export const boardsInRoom = (room: string): RoomBoard[] => Object.values(ROOM_BOARDS).filter((b) => b.room === room);

// ---------------------------------------------------------------------------
// 기간 (모두 KST)

const DAY = 86_400_000;
const KST = 9 * 3600_000;

/** 이번 주 월요일(KST) 날짜 YYYY-MM-DD */
export const kstWeekDay = (now = new Date()) => kstDay(new Date(weekStart(now)));
/** 이번 달 1일(KST) */
export const kstMonthDay = (now = new Date()) => `${kstDay(now).slice(0, 7)}-01`;
/** 이번 분기 첫날(KST) */
export function kstQuarterDay(now = new Date()): string {
  const [y, m] = kstDay(now).split("-").map(Number) as [number, number];
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}
/** 별점판 기간 (all 은 하나로 고정) */
export const ratingPeriod = (b: RatingBoard, now = new Date()) => (b.period === "quarter" ? kstQuarterDay(now) : "2000-01-01");
/** 기록판에서 한 줄이 들어가는 기간 */
export const logPeriod = (b: LogBoard, now = new Date()) => (b.period === "month" ? kstMonthDay(now) : kstDay(now));
/**
 * 기록판 집계 창: 하루 단위 판은 이번 주(월요일부터), 한 달 단위 판은 이번 달.
 * 책은 "이번 달"이 맞아 하루 기록이어도 달로 모은다 (window 로 고른다)
 */
export function logWindow(b: LogBoard, now = new Date()): { from: string; label: "이번 주" | "이번 달" } {
  if (b.period === "month" || b.key === "book-pages") return { from: kstMonthDay(now), label: "이번 달" };
  return { from: kstWeekDay(now), label: "이번 주" };
}
export const pickPeriod = (b: PickBoard, now = new Date()) => (b.period === "week" ? kstWeekDay(now) : kstDay(now));

/** 사진 투표 주: 금요일 밤 9시(KST)에 시작하는 주의 그 금요일 날짜 */
export function photoWeek(now = new Date()): string {
  const t = new Date(now.getTime() + KST - 21 * 3600_000);
  const back = (t.getUTCDay() - 5 + 7) % 7;
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - back)).toISOString().slice(0, 10);
}
/** 지난 사진 투표 주 */
export const prevPhotoWeek = (now = new Date()) => addDays(photoWeek(now), -7);
/** 이번 사진 투표가 끝나는 시각 (다음 금요일 21:00 KST) */
export const photoWeekEnds = (now = new Date()) => new Date(Date.parse(`${photoWeek(now)}T21:00:00+09:00`) + 7 * DAY);

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const addMonths = (day: string, n: number) => {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};

/** 연속 기간 수. 이번 기간이 비었으면 지난 기간부터 센다 (아직 오늘 안 남겨도 연속은 살아 있다) */
export function periodStreak(periods: readonly string[], current: string, unit: "day" | "month"): number {
  const set = new Set(periods.map((p) => p.slice(0, 10)));
  const step = (p: string) => (unit === "day" ? addDays(p, -1) : addMonths(p, -1));
  let p = set.has(current) ? current : step(current);
  let n = 0;
  while (set.has(p)) {
    n++;
    p = step(p);
  }
  return n;
}

// ---------------------------------------------------------------------------
// 집계 (작은 수 숨기기)

/** 평균은 3명부터 */
export const AVG_MIN_PEOPLE = 3;
/** 내 위치(상위 n%)는 5명부터 */
export const RANK_MIN_PEOPLE = 5;
/** 완료율은 5명부터 */
export const RATE_MIN_PEOPLE = 5;
/** 별점 평균·성공률은 3명부터 */
export const RATING_MIN = 3;
/** 퀴즈 정답률은 5명부터 */
export const QUIZ_RATE_MIN = 5;

/** 상위 n% (나보다 많은 사람 수 + 1) / 전체. 사람이 적으면 null */
export function topPercent(totals: readonly number[], mine: number | null): number | null {
  if (mine === null || totals.length < RANK_MIN_PEOPLE) return null;
  const higher = totals.filter((t) => t > mine).length;
  return Math.max(1, Math.ceil(((higher + 1) / totals.length) * 100));
}

export const avgOf = (total: number, people: number, min = AVG_MIN_PEOPLE): number | null => (people >= min ? Math.round((total / people) * 10) / 10 : null);

/** 숫자 보기 (소수 한 자리까지, 0 은 버림) */
export const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ko-KR") : (Math.round(n * 10) / 10).toLocaleString("ko-KR"));

// ---------------------------------------------------------------------------
// 입력 (검사는 서버 전용 src/lib/roomBoardsCheck.ts)

/** 같은 제목을 하나로 모으는 정리 (공백 하나, 앞뒤 공백 없음) */
export const cleanLabel = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// 📸 사진 투표

export const PHOTO_HIDE_REPORTS = 2;
export type PhotoScore = { id: string; hearts: number; created_at: string | Date; is_hidden?: boolean };
/** 1등: ❤️ 가장 많은 사진 (1개 이상), 같으면 먼저 올린 사진. 가려진 사진은 빼고 */
export function photoWinner<T extends PhotoScore>(photos: readonly T[]): T | null {
  let best: T | null = null;
  for (const p of photos) {
    if (p.is_hidden || p.hearts < 1) continue;
    if (!best || p.hearts > best.hearts || (p.hearts === best.hearts && new Date(p.created_at).getTime() < new Date(best.created_at).getTime())) best = p;
  }
  return best;
}
export const WINNER_BADGE = "🏆 이번 주 1등";

// ---------------------------------------------------------------------------
// 🤔 살까 말까

export const VOTE_HOURS = 48;
export const VOTE_DAILY_POSTS = 3;
export const VOTE_HIDE_REPORTS = 2;

// ---------------------------------------------------------------------------
// 🌱 이 성분 동물성일까? (원료가 분명한 것만. 출처가 여럿인 성분은 넣지 않았다)

export type Ingredient = { name: string; animal: boolean; why: string };
export const INGREDIENTS: readonly Ingredient[] = [
  { name: "젤라틴", animal: true, why: "돼지·소의 껍질과 뼈에서 뽑은 콜라겐으로 만들어요." },
  { name: "카민(코치닐)", animal: true, why: "연지벌레를 말려 뽑은 붉은 색소예요." },
  { name: "셸락", animal: true, why: "락깍지벌레가 낸 분비물로 만든 광택제예요." },
  { name: "카제인", animal: true, why: "우유에 든 단백질이에요." },
  { name: "유청(훼이)", animal: true, why: "치즈를 만들고 남은 우유 성분이에요." },
  { name: "유당(락토스)", animal: true, why: "우유에 든 당이에요." },
  { name: "라놀린", animal: true, why: "양털에서 나오는 기름이에요." },
  { name: "꿀", animal: true, why: "벌이 꽃꿀을 모아 만든 거예요." },
  { name: "밀랍(비즈왁스)", animal: true, why: "벌집을 이루는 왁스예요." },
  { name: "이징글라스", animal: true, why: "물고기 부레에서 얻어요. 맥주·와인을 맑게 할 때 써요." },
  { name: "콜라겐", animal: true, why: "주로 생선·돼지·소의 껍질과 뼈에서 얻어요." },
  { name: "라이소자임", animal: true, why: "달걀흰자에서 얻는 효소예요." },
  { name: "난백(달걀흰자)", animal: true, why: "달걀에서 나온 거예요." },
  { name: "액젓", animal: true, why: "멸치·까나리 같은 생선을 소금에 삭혀 만들어요." },
  { name: "굴소스", animal: true, why: "굴 추출물로 만들어요." },
  { name: "버터", animal: true, why: "우유의 지방으로 만들어요." },
  { name: "기(ghee)", animal: true, why: "버터를 끓여 맑게 거른 기름이에요." },
  { name: "로열젤리", animal: true, why: "일벌이 여왕벌 애벌레에게 주려고 만드는 분비물이에요." },
  { name: "프로폴리스", animal: true, why: "벌이 나무 수지를 모아 벌집에 바른 거예요. 벌의 산물이라 비건에서는 빼요." },
  { name: "앤초비", animal: true, why: "멸치류 생선을 염장한 거예요." },
  { name: "한천", animal: false, why: "우뭇가사리 같은 해조류로 만들어요." },
  { name: "카라기난", animal: false, why: "홍조류(바닷말)에서 뽑아요." },
  { name: "펙틴", animal: false, why: "사과·감귤 껍질에서 뽑아요." },
  { name: "구아검", animal: false, why: "구아콩 씨앗에서 얻어요." },
  { name: "잔탄검", animal: false, why: "미생물이 당을 발효해 만들어요." },
  { name: "알긴산", animal: false, why: "미역·다시마 같은 갈조류에서 얻어요." },
  { name: "로커스트빈검", animal: false, why: "캐롭나무 열매 씨앗에서 얻어요." },
  { name: "아라비아검", animal: false, why: "아카시아나무 수액을 굳힌 거예요." },
  { name: "카나우바 왁스", animal: false, why: "카나우바 야자 잎에서 얻는 왁스예요." },
  { name: "대두 레시틴", animal: false, why: "콩에서 뽑은 유화제예요." },
  { name: "카카오 버터", animal: false, why: "이름은 버터지만 카카오 콩의 지방이에요." },
  { name: "영양 효모", animal: false, why: "효모를 키워 말린 거예요." },
  { name: "말토덱스트린", animal: false, why: "옥수수·감자 같은 전분을 분해해 만들어요." },
  { name: "스테비아", animal: false, why: "스테비아 잎에서 뽑은 단맛이에요." },
  { name: "비트레드", animal: false, why: "붉은 비트 뿌리에서 뽑은 색소예요." },
  { name: "커큐민", animal: false, why: "강황 뿌리에서 뽑은 노란 색소예요." },
  { name: "아가베 시럽", animal: false, why: "아가베(용설란) 수액으로 만들어요." },
  { name: "완두 단백", animal: false, why: "완두콩에서 뽑은 단백질이에요." },
  { name: "메이플 시럽", animal: false, why: "단풍나무 수액을 졸여 만들어요." },
  { name: "코코넛 밀크", animal: false, why: "이름은 밀크지만 코코넛 과육으로 만들어요." },
];

/** 날짜로 돌리는 오늘의 성분 (7칸씩 건너뛰어 동물성·아님이 섞이게. 7 과 목록 길이는 서로소여야 한 바퀴에 다 나온다) */
export function ingredientOfDay(day: string): Ingredient {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY);
  return INGREDIENTS[(((n * 7) % INGREDIENTS.length) + INGREDIENTS.length) % INGREDIENTS.length]!;
}
export const quizAnswer = (day: string) => (ingredientOfDay(day).animal ? "동물성" : "동물성 아님");

// ---------------------------------------------------------------------------
// 🐶 달력

export const PET_NAME_MAX = 10;
export const PETS_PER_PERSON = 3;
export const PET_HIDE_REPORTS = 2;
export const PET_KIND_LABEL = { birthday: "생일", adopted: "입양일" } as const;
export type PetKind = keyof typeof PET_KIND_LABEL;
/** 그 달에 있는 날인지 (2월 29일은 받는다) */
export function validMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return false;
  return day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}
/** 오늘(KST) 월·일 */
export function kstMonthDayParts(now = new Date()): { month: number; day: number } {
  const [, m, d] = kstDay(now).split("-").map(Number) as [number, number, number];
  return { month: m, day: d };
}

// ---------------------------------------------------------------------------
// ⭐ 별점판

/** 점수 검사: 별점 1~5, 성공/실패 1/0 */
export const ratingScoreOk = (b: RatingBoard, score: number) => Number.isInteger(score) && (b.scale === "stars" ? score >= 1 && score <= 5 : score === 0 || score === 1);
export type RatingRow = { label: string; n: number; sum: number; mine: number | null };
/** 평균이 열린 항목(3명 이상)은 평균 높은 순, 나머지는 사람 수 순 */
export function ratingBoard(rows: readonly RatingRow[]): { shown: (RatingRow & { avg: number })[]; waiting: RatingRow[] } {
  const shown = rows.filter((r) => r.n >= RATING_MIN).map((r) => ({ ...r, avg: Math.round((r.sum / r.n) * 100) / 100 }));
  shown.sort((a, b) => b.avg - a.avg || b.n - a.n || a.label.localeCompare(b.label, "ko"));
  const waiting = rows.filter((r) => r.n < RATING_MIN).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ko"));
  return { shown, waiting };
}

/** 칩 크기 (1~5 단계): 가장 많은 것 대비 */
export const chipSize = (count: number, max: number) => (max <= 0 || count <= 0 ? 1 : Math.max(1, Math.min(5, Math.ceil((count / max) * 5))));
