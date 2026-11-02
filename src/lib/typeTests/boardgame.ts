import type { TypeTest } from "./engine";

/** 🎲 나에게 맞는 보드게임 스타일 (11/2, 보드게임·방탈출 덕후방). 특정 제품 추천 없이 장르 예시만 */
export const BOARDGAME_TEST: TypeTest = {
  key: "boardgame",
  room: "보드게임-방탈출-덕후방",
  roomName: "보드게임·방탈출 덕후방",
  emoji: "🎲",
  title: "보드게임 스타일 테스트",
  resultLabel: "나의 보드게임 스타일",
  intro: "나에게 맞는 보드게임 장르가 나와요.",
  description: "전략가? 파티러? 협력러? 추리러? 질문 7개로 알아보는 나의 보드게임 스타일.",
  types: [
    { key: "strategist", emoji: "🧠", name: "전략가", what: "세 수 앞을 내다보는 타입. 자원 관리·일꾼 놓기 같은 전략 게임이 잘 맞아요." },
    { key: "party", emoji: "🎉", name: "파티러", what: "웃음이 터지면 이긴 거예요. 순발력·눈치 게임처럼 여럿이 하는 파티 게임이 잘 맞아요." },
    { key: "coop", emoji: "🤝", name: "협력러", what: "다 같이 이기는 게 제일 좋아요. 함께 위기를 막는 협력 게임이 잘 맞아요." },
    { key: "detective", emoji: "🔍", name: "추리러", what: "단서를 모아 답을 찾을 때 짜릿해요. 추리 게임과 방탈출이 잘 맞아요." },
  ],
  questions: [
    { q: "게임 설명서를 받으면?", options: [
      { label: "끝까지 꼼꼼히 읽어요", to: ["strategist"] }, { label: "일단 해 보면서 배워요", to: ["party"] }, { label: "같이 읽으며 정리해요", to: ["coop"] }, { label: "숨은 규칙이 있나 찾아봐요", to: ["detective"] },
    ] },
    { q: "제일 기분 좋은 순간은?", options: [
      { label: "계획대로 점수가 쌓일 때", to: ["strategist"] }, { label: "다 같이 빵 터질 때", to: ["party"] }, { label: "팀이 위기를 넘길 때", to: ["coop"] }, { label: "단서가 딱 맞아떨어질 때", to: ["detective"] },
    ] },
    { q: "몇 명이서 하는 게 좋아요?", options: [
      { label: "두세 명", to: ["strategist", "detective"] }, { label: "여섯 명 이상", to: ["party"] }, { label: "네 명 정도", to: ["coop"] },
    ] },
    { q: "한 판 길이는?", options: [
      { label: "두 시간도 좋아요", to: ["strategist"] }, { label: "10분짜리 여러 판", to: ["party"] }, { label: "한 시간 정도", to: ["coop", "detective"] },
    ] },
    { q: "방탈출에 가면 나는?", options: [
      { label: "자물쇠 담당", to: ["strategist"] }, { label: "분위기 담당", to: ["party"] }, { label: "힌트 정리 담당", to: ["coop"] }, { label: "단서 발견 담당", to: ["detective"] },
    ] },
    { q: "지고 나면?", options: [
      { label: "어디서 틀렸나 복기", to: ["strategist"] }, { label: "한 판 더!", to: ["party"] }, { label: "다음엔 같이 이기자", to: ["coop"] }, { label: "범인이 누군지 다시 추리", to: ["detective"] },
    ] },
    { q: "새 게임을 고를 때?", options: [
      { label: "깊이가 있는 게임", to: ["strategist"] }, { label: "규칙이 쉬운 게임", to: ["party"] }, { label: "다 같이 하는 게임", to: ["coop"] }, { label: "이야기가 있는 게임", to: ["detective"] },
    ] },
  ],
};
