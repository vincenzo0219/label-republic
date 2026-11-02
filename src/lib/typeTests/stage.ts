import type { TypeTest } from "./engine";

/** 🎭 관극 스타일 (11/2, 뮤지컬·연극 덕후방). 작품·배우 실명 없이 보는 방식만 */
export const STAGE_TEST: TypeTest = {
  key: "stage",
  room: "뮤지컬-연극-덕후방",
  roomName: "뮤지컬·연극 덕후방",
  emoji: "🎭",
  title: "관극 스타일 테스트",
  resultLabel: "나의 관극 스타일",
  intro: "나의 관극 스타일이 나와요.",
  description: "회전문 관객? 넘버 덕후? 서사 분석러? 질문 7개로 알아보는 나의 관극 스타일.",
  types: [
    { key: "repeat", emoji: "🔁", name: "회전문 관객", what: "마음에 든 작품은 몇 번이고 다시 봐요. 볼 때마다 새로운 장면을 찾아내요." },
    { key: "actor", emoji: "🌟", name: "캐스팅 덕후", what: "같은 작품도 배우에 따라 다르게 봐요. 캐스팅 공지가 제일 설레요." },
    { key: "number", emoji: "🎵", name: "넘버 덕후", what: "공연이 끝나도 노래가 머릿속에서 안 끝나요. 출근길 플레이리스트가 다 넘버예요." },
    { key: "story", emoji: "📖", name: "서사 분석러", what: "연출과 대사 하나하나에 의미를 찾아요. 관극 후기가 제일 길어요." },
    { key: "explorer", emoji: "🧭", name: "신작 탐험가", what: "처음 보는 작품에 먼저 손이 가요. 작은 극장의 숨은 작품도 잘 찾아요." },
  ],
  questions: [
    { q: "공연을 고르는 기준은?", options: [
      { label: "좋아하는 배우", to: ["actor"] }, { label: "음악", to: ["number"] }, { label: "줄거리·연출", to: ["story"] }, { label: "아직 안 본 작품", to: ["explorer"] },
    ] },
    { q: "마음에 든 작품을 보고 나면?", options: [
      { label: "또 예매해요", to: ["repeat"] }, { label: "다른 캐스트로 한 번 더", to: ["actor", "repeat"] }, { label: "OST 무한 반복", to: ["number"] }, { label: "다음 신작을 찾아요", to: ["explorer"] },
    ] },
    { q: "가고 싶은 자리는?", options: [
      { label: "배우 표정이 보이는 앞쪽", to: ["actor"] }, { label: "무대 전체가 보이는 2층", to: ["story"] }, { label: "소리가 좋은 가운데", to: ["number"] }, { label: "자리보다 일단 보기", to: ["explorer", "repeat"] },
    ] },
    { q: "공연이 끝나고 집 가는 길에?", options: [
      { label: "커튼콜 사진 정리", to: ["actor"] }, { label: "해석 글 찾아보기", to: ["story"] }, { label: "넘버 흥얼거리기", to: ["number"] }, { label: "다음 회차 예매", to: ["repeat"] },
    ] },
    { q: "내 티켓북은?", options: [
      { label: "같은 작품이 가득", to: ["repeat"] }, { label: "다 다른 작품", to: ["explorer"] },
    ] },
    { q: "친구에게 추천할 때?", options: [
      { label: "이 배우 꼭 봐", to: ["actor"] }, { label: "이 장면 뜻이 뭐냐면", to: ["story"] }, { label: "이 노래부터 들어 봐", to: ["number"] }, { label: "정보 없이 그냥 가 봐", to: ["explorer"] },
    ] },
    { q: "뮤지컬과 연극 중에?", options: [
      { label: "노래가 있는 뮤지컬", to: ["number", "actor"] }, { label: "대사가 깊은 연극", to: ["story", "explorer"] }, { label: "둘 다, 본 걸 또 봐요", to: ["repeat"] },
    ] },
  ],
};
