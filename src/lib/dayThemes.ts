/**
 * 🎉 방마다 다른 기념일 (10/27 대표님 "육아방은 덕질이 아니라 아이 관련 기념일로. 각 방마다 특징에 맞게").
 * 저장·카드 API 의 종류 키(ipduk·first·bday·start)는 그대로 두고, 방마다 이름·문구·보이는 종류만 바꾼다.
 * - ipduk·first·start: 고른 날이 1일째, 1·10·100일마다 · bday: 해마다 그 날 (생일·개업 기념일)
 * - label: 고르는 버튼 · phrase: "○○ 100일째" 의 ○○ · bday.owner: "오늘은 ○○님 [최애의 생일]이에요"
 * 목록에 없는 방은 덕질 기본값. 방에서 뺀 종류로 예전에 저장한 기념일은 기본 이름으로 계속 보인다.
 */
import type { FanPreset } from "./fanDays";

type Item = { label: string; phrase: string };
type BdayItem = Item & { owner: string };
export type DayTheme = {
  /** 제목 "🎉 내 덕질 기념일" */
  title: string;
  ipduk?: Item;
  first?: Item;
  start?: Item;
  bday?: BdayItem;
};

const FAN: Required<Omit<DayTheme, "title">> = {
  ipduk: { label: "입덕일", phrase: "입덕" },
  first: { label: "첫 직관·첫 참가", phrase: "첫 직관·참가" },
  bday: { label: "최애 생일", phrase: "최애 생일", owner: "최애의 생일" },
  start: { label: "시작한 날", phrase: "{room} 시작" },
};

const fan = (over: Partial<DayTheme> = {}): DayTheme => ({ title: "🎉 내 덕질 기념일", ...FAN, ...over });
const invest = (start: Item): DayTheme => ({ title: "💰 내 투자 기념일", start, first: { label: "첫 매수", phrase: "첫 매수" } });

const THEMES: Record<string, DayTheme> = {
  "육아-덕후방": {
    title: "👶 우리 아이 기념일",
    ipduk: { label: "태어난 날", phrase: "아이 태어난 지" },
    first: { label: "첫걸음", phrase: "첫걸음" },
    start: { label: "첫 등원", phrase: "첫 등원" },
    bday: { label: "아이 생일", phrase: "아이 생일", owner: "아이의 생일" },
  },
  "반려견-덕후방": {
    title: "🐶 우리 강아지 기념일",
    ipduk: { label: "입양한 날", phrase: "입양" },
    first: { label: "처음 만난 날", phrase: "첫 만남" },
    bday: { label: "강아지 생일", phrase: "강아지 생일", owner: "강아지의 생일" },
  },
  "고양이-집사방": {
    title: "🐱 우리 고양이 기념일",
    ipduk: { label: "입양한 날", phrase: "입양" },
    first: { label: "처음 만난 날", phrase: "묘연" },
    bday: { label: "고양이 생일", phrase: "고양이 생일", owner: "고양이의 생일" },
  },
  "비바리움-덕후방": {
    title: "🦎 우리 아이 기념일",
    ipduk: { label: "입양한 날", phrase: "입양" },
    start: { label: "사육장 꾸민 날", phrase: "사육장" },
  },
  "오늘도-장사중": {
    title: "🏪 우리 가게 기념일",
    start: { label: "가게 연 날", phrase: "개업" },
    first: { label: "첫 손님 온 날", phrase: "첫 손님" },
    bday: { label: "개업 기념일", phrase: "개업 기념일", owner: "가게의 개업 기념일" },
  },
  "요가-필라테스-강사방": {
    title: "🧘 내 강사 기념일",
    start: { label: "강사 시작한 날", phrase: "강사" },
    first: { label: "첫 수업 한 날", phrase: "첫 수업" },
    ipduk: { label: "자격증 딴 날", phrase: "자격증" },
  },
  "요가-필라테스-덕후방": {
    title: "🧘 내 수련 기념일",
    start: { label: "수련 시작한 날", phrase: "수련" },
    first: { label: "첫 수업", phrase: "첫 수업" },
  },
  "러닝-덕후방": {
    title: "🏃 내 러닝 기념일",
    start: { label: "러닝 시작한 날", phrase: "러닝 시작" },
    first: { label: "첫 대회·첫 완주", phrase: "첫 완주" },
  },
  "다이어트-식단-함께해요": {
    title: "🥗 내 다이어트 기념일",
    start: { label: "시작한 날", phrase: "다이어트" },
    first: { label: "첫 목표 달성", phrase: "목표 달성" },
  },
  "비건-덕후방": {
    title: "🌱 내 비건 기념일",
    start: { label: "비건 시작한 날", phrase: "비건" },
  },
  "커피-덕후방": {
    title: "☕ 내 커피 기념일",
    start: { label: "커피 입문한 날", phrase: "커피 입문" },
    first: { label: "홈카페 시작한 날", phrase: "홈카페" },
  },
  "와인-위스키-덕후방": {
    title: "🍷 내 술 기념일",
    start: { label: "입문한 날", phrase: "입문" },
    first: { label: "첫 시음회", phrase: "첫 시음회" },
  },
  "테니스-덕후방": {
    title: "🎾 내 테니스 기념일",
    start: { label: "테니스 시작한 날", phrase: "테니스" },
    first: { label: "첫 대회 나간 날", phrase: "첫 대회" },
  },
  "캠핑-덕후방": {
    title: "⛺ 내 캠핑 기념일",
    start: { label: "캠핑 시작한 날", phrase: "캠핑" },
    first: { label: "첫 캠핑", phrase: "첫 캠핑" },
  },
  "필름카메라-덕후방": {
    title: "📷 내 필카 기념일",
    start: { label: "필카 시작한 날", phrase: "필카" },
    first: { label: "첫 롤 현상", phrase: "첫 롤" },
  },
  "읽는-책-제목을-교환해-보자": {
    title: "📚 내 독서 기념일",
    start: { label: "독서 시작한 날", phrase: "독서" },
    first: { label: "첫 완독", phrase: "첫 완독" },
    bday: { label: "최애 작가 생일", phrase: "최애 작가 생일", owner: "최애 작가의 생일" },
  },
  작가지망생방: {
    title: "✍️ 내 글쓰기 기념일",
    start: { label: "글쓰기 시작한 날", phrase: "글쓰기" },
    first: { label: "첫 투고·첫 공모전", phrase: "첫 투고" },
  },
  "적립식-투자방": invest({ label: "적립 시작한 날", phrase: "적립" }),
  미국주식방: invest({ label: "투자 시작한 날", phrase: "투자" }),
  주식: invest({ label: "투자 시작한 날", phrase: "투자" }),
  "kbo-덕후방": fan({ first: { label: "첫 직관", phrase: "첫 직관" }, bday: { label: "최애 선수 생일", phrase: "최애 선수 생일", owner: "최애 선수의 생일" } }),
  "k리그-덕후방": fan({ first: { label: "첫 직관", phrase: "첫 직관" }, bday: { label: "최애 선수 생일", phrase: "최애 선수 생일", owner: "최애 선수의 생일" } }),
  "뮤지컬-연극-덕후방": fan({ first: { label: "첫 관람", phrase: "첫 관람" }, bday: { label: "최애 배우 생일", phrase: "최애 배우 생일", owner: "최애 배우의 생일" } }),
  "드라마-덕후방": fan({ first: { label: "첫 정주행", phrase: "첫 정주행" }, bday: { label: "최애 배우 생일", phrase: "최애 배우 생일", owner: "최애 배우의 생일" } }),
  "애니-만화-덕후방": fan({ first: { label: "첫 행사·첫 굿즈", phrase: "첫 행사" }, bday: { label: "최애 캐릭터 생일", phrase: "최애 캐릭터 생일", owner: "최애 캐릭터의 생일" } }),
  "게임-덕후방": fan({ first: { label: "첫 플레이", phrase: "첫 플레이" }, bday: { label: "최애 캐릭터 생일", phrase: "최애 캐릭터 생일", owner: "최애 캐릭터의 생일" } }),
  "신발-덕후방": { title: "👟 내 신발 기념일", ipduk: { label: "입덕일", phrase: "신발 입덕" }, first: { label: "첫 드로우 당첨", phrase: "첫 당첨" } },
  "perfume-audio": { title: "🎧 내 음향 기념일", ipduk: { label: "입덕일", phrase: "음향 입덕" }, first: { label: "정착템 들인 날", phrase: "정착템" } },
  "팝업-전시-덕후방": { title: "🛍️ 내 팝업·전시 기념일", ipduk: { label: "입덕일", phrase: "입덕" }, first: { label: "첫 오픈런", phrase: "첫 오픈런" } },
  "키덜트-덕후방": { title: "🧸 내 수집 기념일", start: { label: "수집 시작한 날", phrase: "수집" }, first: { label: "첫 피규어·첫 레고", phrase: "첫 수집품" } },
  "보드게임-방탈출-덕후방": { title: "🎲 내 보드게임 기념일", ipduk: { label: "입덕일", phrase: "입덕" }, first: { label: "첫 방탈출 성공", phrase: "첫 탈출" } },
  "ai-덕후방": { title: "🤖 내 AI 기념일", start: { label: "AI 입문한 날", phrase: "AI 입문" }, first: { label: "첫 프로젝트", phrase: "첫 프로젝트" } },
};

/** 고르는 버튼 순서 */
const ORDER: FanPreset[] = ["ipduk", "start", "first", "bday"];

export function dayTheme(slug: string): DayTheme {
  return THEMES[slug] ?? fan();
}

/** 이 방에서 고를 수 있는 종류 (순서대로) */
export function themePresets(slug: string): { key: FanPreset; label: string }[] {
  const t = dayTheme(slug);
  return ORDER.filter((k) => t[k]).map((k) => ({ key: k, label: t[k]!.label }));
}

export const themeAllows = (slug: string, p: FanPreset): boolean => !!dayTheme(slug)[p];

/** 이 방의 이름 (방에서 뺀 종류면 덕질 기본값) */
export function themeItem(slug: string, p: FanPreset, roomShort: string): Item {
  const it = dayTheme(slug)[p] ?? FAN[p];
  return { label: it.label, phrase: it.phrase.replace("{room}", roomShort) };
}

export function themeBday(slug: string): BdayItem {
  return dayTheme(slug).bday ?? FAN.bday;
}

/** 아래 안내 한 줄: "고른 날짜가 1일째예요. 1일·10일·100일마다(아이 생일은 해마다) 카드를 올릴 수 있어요." */
export function themeHint(slug: string): string {
  const b = dayTheme(slug).bday;
  const onlyBday = themePresets(slug).every((p) => p.key === "bday");
  if (onlyBday) return `${b!.label}마다 카드를 올릴 수 있어요.`;
  return `고른 날짜가 1일째예요. 1일·10일·100일마다${b ? `(${b.label}은 해마다)` : ""} 카드를 올릴 수 있어요.`;
}
