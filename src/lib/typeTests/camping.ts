import type { TypeTest } from "./engine";

/** ⛺ 캠핑 스타일 (11/2, 캠핑 덕후방). 장비 브랜드·캠핑장 이름 없이 즐기는 방식만 */
export const CAMPING_TEST: TypeTest = {
  key: "camping",
  room: "캠핑-덕후방",
  roomName: "캠핑 덕후방",
  emoji: "⛺",
  title: "캠핑 스타일 테스트",
  resultLabel: "나의 캠핑 스타일",
  intro: "나의 캠핑 스타일이 나와요.",
  description: "장비 덕후? 차박러? 캠핑 요리사? 질문 7개로 알아보는 나의 캠핑 스타일.",
  types: [
    { key: "gear", emoji: "🔦", name: "장비 덕후", what: "새 장비를 펼칠 때가 제일 설레요. 사이트 세팅이 곧 작품이에요." },
    { key: "car", emoji: "🚙", name: "차박러", what: "차 한 대면 어디든 캠핑장이에요. 가볍게 떠나는 게 최고예요." },
    { key: "cook", emoji: "🍖", name: "캠핑 요리사", what: "캠핑은 먹으러 가는 거예요. 불 앞에 서면 손이 바빠져요." },
    { key: "nature", emoji: "🌲", name: "자연 힐링러", what: "새소리와 장작 소리면 충분해요. 아무것도 안 하는 시간이 좋아요." },
    { key: "glam", emoji: "✨", name: "글램핑러", what: "자연은 좋지만 편한 것도 좋아요. 준비된 곳에서 여유 있게 쉬어요." },
  ],
  questions: [
    { q: "캠핑 떠나기 전날 밤에?", options: [
      { label: "장비 점검·정리", to: ["gear"] }, { label: "장보기 목록 쓰기", to: ["cook"] }, { label: "차에 짐 대충 싣기", to: ["car"] }, { label: "예약 확인만 하고 자기", to: ["glam"] },
    ] },
    { q: "도착하면 제일 먼저?", options: [
      { label: "텐트·타프 치기", to: ["gear"] }, { label: "불 피우기", to: ["cook"] }, { label: "의자 펴고 하늘 보기", to: ["nature", "car"] }, { label: "숙소 둘러보기", to: ["glam"] },
    ] },
    { q: "좋아하는 장소는?", options: [
      { label: "넓은 오토캠핑장", to: ["gear", "cook"] }, { label: "조용한 바닷가 주차장", to: ["car"] }, { label: "깊은 숲속", to: ["nature"] }, { label: "시설 좋은 글램핑장", to: ["glam"] },
    ] },
    { q: "캠핑 저녁 메뉴는?", options: [
      { label: "직접 만든 코스 요리", to: ["cook"] }, { label: "간단한 라면과 김밥", to: ["car", "nature"] }, { label: "새 장비로 해 보는 요리", to: ["gear"] }, { label: "준비된 바비큐 세트", to: ["glam"] },
    ] },
    { q: "밤에는?", options: [
      { label: "불멍하며 조용히", to: ["nature"] }, { label: "조명 세팅 감상", to: ["gear"] }, { label: "야식 한 번 더", to: ["cook"] }, { label: "차 안에서 별 보기", to: ["car"] },
    ] },
    { q: "짐 싸는 스타일은?", options: [
      { label: "꽉꽉, 다 챙겨요", to: ["gear", "cook"] }, { label: "가볍게, 최소한만", to: ["car", "nature"] }, { label: "옷 가방 하나", to: ["glam"] },
    ] },
    { q: "캠핑이 좋은 이유는?", options: [
      { label: "내 손으로 만드는 공간", to: ["gear"] }, { label: "훌쩍 떠나는 자유", to: ["car"] }, { label: "밖에서 먹는 밥", to: ["cook"] }, { label: "쉼과 여유", to: ["nature", "glam"] },
    ] },
  ],
};
