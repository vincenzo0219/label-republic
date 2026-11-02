import type { TypeTest } from "./engine";

/** 🐱 냥이 성격 (11/2, 고양이 집사방). 집사가 우리 고양이에 대해 답한다. 건강·행동 문제 판단은 묻지도 말하지도 않는다 */
export const CAT_TEST: TypeTest = {
  key: "cat",
  room: "고양이-집사방",
  roomName: "고양이 집사방",
  emoji: "🐱",
  title: "냥이 성격 테스트",
  resultLabel: "우리 냥이 성격",
  intro: "우리 고양이를 떠올리며 골라 주세요. 집사가 답하는 냥이 성격 테스트예요.",
  description: "사냥꾼냥? 껌딱지냥? 도도한 보스냥? 집사가 답하는 질문 7개로 알아보는 우리 냥이 성격.",
  note: "재미로 보는 성격 타입이에요. 건강이나 행동이 걱정되면 동물병원에 물어보세요.",
  types: [
    { key: "hunter", emoji: "🐾", name: "사냥꾼냥", what: "낚싯대만 보면 눈이 반짝여요. 집 안 모든 게 사냥감이에요." },
    { key: "cuddle", emoji: "🥰", name: "껌딱지냥", what: "집사 옆이 제일 좋아요. 화장실 앞까지 따라오는 다정한 냥이에요." },
    { key: "boss", emoji: "👑", name: "도도한 보스냥", what: "만져도 되는 때는 내가 정해요. 그래도 집사를 제일 잘 지켜봐요." },
    { key: "explorer", emoji: "🧭", name: "탐험가냥", what: "새 상자, 새 가구는 무조건 먼저 들어가 봐요. 호기심이 하루를 채워요." },
    { key: "sleepy", emoji: "😴", name: "잠꾸러기냥", what: "햇볕 드는 자리를 귀신같이 찾아요. 느긋함이 매력이에요." },
  ],
  questions: [
    { q: "집사가 퇴근하면?", options: [
      { label: "현관까지 마중 나와요", to: ["cuddle"] }, { label: "자리에서 눈만 떠요", to: ["sleepy", "boss"] }, { label: "가방부터 살펴요", to: ["explorer"] }, { label: "발목을 덮쳐요", to: ["hunter"] },
    ] },
    { q: "새 상자가 생기면?", options: [
      { label: "바로 들어가요", to: ["explorer"] }, { label: "상자 안에서 잠들어요", to: ["sleepy"] }, { label: "한참 지켜본 뒤 들어가요", to: ["boss"] }, { label: "상자를 사냥해요", to: ["hunter"] },
    ] },
    { q: "제일 좋아하는 장난감은?", options: [
      { label: "깃털 낚싯대", to: ["hunter"] }, { label: "집사 손", to: ["cuddle"] }, { label: "아무것도 필요 없어요", to: ["boss", "sleepy"] }, { label: "비닐봉지·병뚜껑", to: ["explorer"] },
    ] },
    { q: "낮 시간에는 주로?", options: [
      { label: "창가에서 햇볕 쬐기", to: ["sleepy"] }, { label: "집 안 순찰", to: ["explorer", "boss"] }, { label: "집사 옆에 붙어 있기", to: ["cuddle"] }, { label: "벌레나 그림자 쫓기", to: ["hunter"] },
    ] },
    { q: "손님이 오면?", options: [
      { label: "먼저 다가가 냄새 맡아요", to: ["explorer"] }, { label: "높은 곳에서 내려다봐요", to: ["boss"] }, { label: "집사 뒤에 숨어요", to: ["cuddle"] }, { label: "신경 안 쓰고 자요", to: ["sleepy"] },
    ] },
    { q: "쓰다듬으면?", options: [
      { label: "골골송을 불러요", to: ["cuddle", "sleepy"] }, { label: "세 번까지만 허락해요", to: ["boss"] }, { label: "손을 장난감 삼아요", to: ["hunter"] },
    ] },
    { q: "우리 냥이를 한 단어로?", options: [
      { label: "에너지", to: ["hunter"] }, { label: "애교", to: ["cuddle"] }, { label: "카리스마", to: ["boss"] }, { label: "호기심", to: ["explorer"] },
    ] },
  ],
};
