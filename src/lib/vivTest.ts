import { VIVARIUM_INTRO_POST_ID } from "./vivariumTest";

/** 🌿 나는 어떤 비바리움러? 1분 테스트 (10/23, 비바리움 덕후방 — 신발 테스트와 같은 틀). 취미 습관만, 사육 조언·가격 없이. */
export const VIV_TYPE_INTRO_POST_ID = VIVARIUM_INTRO_POST_ID; // 비바리움 덕후방 "🦎 어떤 생물 키우세요? 한 줄 자기소개" (/vivarium-test 와 같은 글)

export type VivTypeAnswers = {
  keeping: boolean; // 키우는 생물·장 있음
  layout: boolean; // 레이아웃 먼저
  watch: boolean; // 한참 구경
  note: boolean; // 사진·기록
  search: boolean; // 끝까지 찾아봄
  feed: boolean; // 밥 먹는 모습
  plan: boolean; // 장바구니에 담아 둔 게 많음
};
export type VivTypeResult = { key: string; emoji: string; name: string; what: string };

export const VIV_TYPE_TYPES: Record<string, VivTypeResult> = {
  layout: { key: "layout", emoji: "🌿", name: "레이아웃 장인", what: "돌 하나 놓는 데도 한참 고민해요. 장 안에 작은 숲을 만들어요." },
  observe: { key: "observe", emoji: "🔎", name: "관찰 기록파", what: "보고 있으면 시간 가는 줄 몰라요. 사진이랑 메모로 하루하루 남겨요." },
  feed: { key: "feed", emoji: "🦗", name: "먹이·사육 연구파", what: "밥 먹는 모습 하나도 그냥 안 넘겨요. 찾아보고 비교하는 게 재밌어요." },
  newbie: { key: "newbie", emoji: "🤔", name: "입문 고민파", what: "아직 장바구니에만 담아 둔 상태. 뭐부터 할지 고민하는 게 제일 재밌어요." },
};

/** 질문마다 한 타입에 점수. 동점이면 입문 고민파 → 레이아웃 장인 → 먹이·사육 연구파 → 관찰 기록파 순 */
export function vivTypePick(a: VivTypeAnswers): VivTypeResult {
  const s = {
    layout: Number(a.layout) + Number(!a.feed),
    observe: Number(a.watch) + Number(a.note),
    feed: Number(a.feed) + Number(a.search),
    newbie: 2 * Number(!a.keeping) + Number(a.plan),
  };
  const order = ["newbie", "layout", "feed", "observe"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return VIV_TYPE_TYPES[best]!;
}

export const vivTypeBragLine = (t: VivTypeResult) => `🌿 비바리움 테스트: ${t.emoji} ${t.name} / 키우는·키우고 싶은 생물: `;
