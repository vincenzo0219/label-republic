import type { TypeTest } from "./engine";

/** 🥗 식단 스타일 (11/2, 다이어트 식단 방). 식단을 꾸리는 방식만. 몸무게·효과·건강 판단은 말하지 않는다 */
export const DIET_TEST: TypeTest = {
  key: "diet",
  room: "다이어트-식단-함께해요",
  roomName: "다이어트 식단 방",
  emoji: "🥗",
  title: "식단 스타일 테스트",
  resultLabel: "나의 식단 스타일",
  intro: "식단을 꾸리는 방식으로 나의 스타일을 알아봐요. 몸무게는 묻지 않아요.",
  description: "계획파? 기록파? 집밥 요리러? 질문 6개로 알아보는 나의 식단 꾸리기 스타일.",
  note: "식단을 꾸리는 습관을 재미로 나눈 결과예요. 효과를 말하는 테스트가 아니에요.",
  types: [
    { key: "prep", emoji: "📦", name: "밀프렙 계획러", what: "일요일에 일주일 도시락을 준비해요. 냉장고가 가지런할수록 마음이 편해요." },
    { key: "record", emoji: "📒", name: "기록러", what: "먹은 걸 사진이나 메모로 남겨요. 쌓인 기록을 보는 게 큰 힘이에요." },
    { key: "cook", emoji: "🍳", name: "집밥 요리러", what: "제철 재료로 이것저것 만들어 봐요. 새 레시피가 제일 즐거워요." },
    { key: "balance", emoji: "⚖️", name: "느슨한 균형파", what: "평일엔 챙기고 주말엔 조금 여유 있게. 오래 가는 게 목표예요." },
    { key: "together", emoji: "🙌", name: "같이 하는 응원러", what: "인증하고 응원받으면 힘이 나요. 같이 하는 사람이 있어야 꾸준해져요." },
  ],
  questions: [
    { q: "식단을 시작할 때 먼저 하는 건?", options: [
      { label: "일주일 메뉴 짜기", to: ["prep"] }, { label: "기록 앱 깔기", to: ["record"] }, { label: "새 레시피 찾기", to: ["cook"] }, { label: "같이 할 사람 찾기", to: ["together"] },
    ] },
    { q: "바쁜 평일 점심은?", options: [
      { label: "싸 온 도시락", to: ["prep"] }, { label: "사 먹고 사진으로 남기기", to: ["record"] }, { label: "그날 먹고 싶은 걸로 적당히", to: ["balance"] },
    ] },
    { q: "주말에는?", options: [
      { label: "다음 주 장보기·준비", to: ["prep"] }, { label: "새 요리 도전", to: ["cook"] }, { label: "먹고 싶은 것 한 끼", to: ["balance"] }, { label: "친구랑 건강한 맛집", to: ["together"] },
    ] },
    { q: "오늘 식단 인증, 나는?", options: [
      { label: "빠짐없이 매일", to: ["record", "together"] }, { label: "잘 차린 날만", to: ["cook"] }, { label: "인증보다 내 기억에", to: ["balance", "prep"] },
    ] },
    { q: "힘이 나는 말은?", options: [
      { label: "준비성 최고", to: ["prep"] }, { label: "기록이 대단해", to: ["record"] }, { label: "이거 레시피 알려 줘", to: ["cook"] }, { label: "오늘도 같이 하자", to: ["together"] },
    ] },
    { q: "계획이 틀어진 날은?", options: [
      { label: "내일 다시 하면 돼요", to: ["balance"] }, { label: "그래도 기록은 남겨요", to: ["record"] }, { label: "방에 털어놓고 응원받아요", to: ["together"] },
    ] },
  ],
};
