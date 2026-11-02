import type { TypeTest } from "./engine";

/** 🛍️ 팝업 취향 (11/2, 팝업·전시 덕후방). 브랜드 이름 없이 다니는 방식만 */
export const POPUP_TEST: TypeTest = {
  key: "popup",
  room: "팝업-전시-덕후방",
  roomName: "팝업·전시 덕후방",
  emoji: "🛍️",
  title: "팝업 취향 테스트",
  resultLabel: "나의 팝업 취향",
  intro: "팝업과 전시를 즐기는 방식으로 나의 취향 타입을 알아봐요.",
  description: "오픈런 헌터? 인증샷 장인? 굿즈 수집가? 질문 7개로 알아보는 나의 팝업 취향.",
  types: [
    { key: "openrun", emoji: "🏃", name: "오픈런 헌터", what: "첫날 첫 타임이 제일 좋아요. 대기 번호 앞자리가 자부심이에요." },
    { key: "photo", emoji: "📸", name: "인증샷 장인", what: "포토존 동선부터 파악해요. 내 사진첩이 곧 팝업 지도예요." },
    { key: "goods", emoji: "🛍️", name: "굿즈 수집가", what: "한정 굿즈를 보면 지나칠 수 없어요. 방 한쪽이 작은 전시장이에요." },
    { key: "art", emoji: "🖼️", name: "전시 감상러", what: "작품 앞에서 오래 머물러요. 설명문까지 다 읽어야 마음이 편해요." },
    { key: "walk", emoji: "🚶", name: "동네 산책러", what: "지나가다 들르는 팝업이 제일 재밌어요. 근처 카페까지 코스로 즐겨요." },
  ],
  questions: [
    { q: "새 팝업 소식을 보면?", options: [
      { label: "오픈 날짜부터 저장", to: ["openrun"] }, { label: "포토존 사진부터 확인", to: ["photo"] }, { label: "굿즈 목록부터 확인", to: ["goods"] }, { label: "근처 가면 들러야지", to: ["walk"] },
    ] },
    { q: "가기 좋은 시간은?", options: [
      { label: "오픈 첫날 아침", to: ["openrun", "goods"] }, { label: "햇빛 좋은 오후", to: ["photo"] }, { label: "한산한 평일", to: ["art"] }, { label: "산책하다 아무 때나", to: ["walk"] },
    ] },
    { q: "입장하면 제일 먼저?", options: [
      { label: "한정 굿즈 코너로", to: ["goods", "openrun"] }, { label: "포토존 줄 서기", to: ["photo"] }, { label: "입구 설명부터 읽기", to: ["art"] }, { label: "천천히 한 바퀴", to: ["walk"] },
    ] },
    { q: "다녀와서 남는 건?", options: [
      { label: "사진 수백 장", to: ["photo"] }, { label: "굿즈 한 봉투", to: ["goods"] }, { label: "기억에 남는 작품 하나", to: ["art"] }, { label: "새로 알게 된 동네", to: ["walk"] },
    ] },
    { q: "대기가 두 시간이라면?", options: [
      { label: "기다려요, 그게 재미", to: ["openrun"] }, { label: "다른 날 다시 와요", to: ["art", "walk"] },
    ] },
    { q: "친구에게 보내는 메시지는?", options: [
      { label: "내일 오픈이래, 같이 가자", to: ["openrun"] }, { label: "여기 사진 진짜 잘 나와", to: ["photo"] }, { label: "이 굿즈 같이 사자", to: ["goods"] }, { label: "이 전시 꼭 봐", to: ["art"] },
    ] },
    { q: "팝업과 전시 중에?", options: [
      { label: "브랜드 팝업", to: ["openrun", "goods", "photo"] }, { label: "미술 전시", to: ["art"] }, { label: "둘 다, 걷다 보이면", to: ["walk"] },
    ] },
  ],
};
