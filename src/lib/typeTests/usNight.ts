import type { TypeTest } from "./engine";

/** 🇺🇸 미국 장 생활 리듬 (11/2, 미국주식방). 한국 시간으로 밤에 열리는 미국 장을 어떻게 챙기는지만. 종목 이야기는 없다 */
export const US_NIGHT_TEST: TypeTest = {
  key: "us-night",
  room: "미국주식방",
  roomName: "미국주식방",
  emoji: "🇺🇸",
  title: "미국 장 생활 리듬 테스트",
  resultLabel: "나의 미국 장 리듬",
  intro: "밤에 열리는 미국 장, 나의 챙기는 리듬이 나와요.",
  description: "밤샘파? 아침파? 주말공부파? 알림파? 질문 6개로 알아보는 나의 미국 장 생활 리듬.",
  note: "생활 리듬을 재미로 나눈 결과예요. 종목 추천이 아니에요. 잠은 꼭 챙기세요.",
  types: [
    { key: "night", emoji: "🌙", name: "밤샘파", what: "개장 종이 울릴 때 깨어 있어요. 밤 열한 시 반이 하루의 하이라이트예요." },
    { key: "morning", emoji: "☀️", name: "아침파", what: "푹 자고 일어나 마감 결과를 봐요. 커피와 함께 정리하는 타입이에요." },
    { key: "weekend", emoji: "📚", name: "주말공부파", what: "평일엔 일상, 주말에 몰아서 공부해요. 실적 일정표를 미리 챙겨요." },
    { key: "alert", emoji: "🔔", name: "알림파", what: "필요한 알림만 켜 두고 잠들어요. 알림이 울릴 때만 확인해요." },
  ],
  questions: [
    { q: "밤 11시 반, 미국 장이 열리면?", options: [
      { label: "깨어서 지켜봐요", to: ["night"] }, { label: "이미 자요", to: ["morning"] }, { label: "알림만 켜 두고 자요", to: ["alert"] },
    ] },
    { q: "아침에 일어나면?", options: [
      { label: "마감 결과부터 확인", to: ["morning"] }, { label: "알림 온 것만 확인", to: ["alert"] }, { label: "어젯밤에 봐서 패스", to: ["night"] }, { label: "주말에 몰아서 볼래요", to: ["weekend"] },
    ] },
    { q: "실적 발표 시즌에는?", options: [
      { label: "발표 시간에 맞춰 깨어 있어요", to: ["night"] }, { label: "다음 날 아침 요약", to: ["morning"] }, { label: "주말에 정리해 읽어요", to: ["weekend"] }, { label: "알림으로만 받아요", to: ["alert"] },
    ] },
    { q: "주말에는?", options: [
      { label: "다음 주 일정 공부", to: ["weekend"] }, { label: "밀린 잠 자기", to: ["night"] }, { label: "가볍게 뉴스 훑기", to: ["morning", "alert"] },
    ] },
    { q: "휴대폰 알림 설정은?", options: [
      { label: "꼭 필요한 것만 몇 개", to: ["alert"] }, { label: "다 꺼 둬요", to: ["weekend", "morning"] }, { label: "알림 없어도 깨어 있어요", to: ["night"] },
    ] },
    { q: "미국 장과 함께하는 나의 다짐은?", options: [
      { label: "밤엔 즐기고 낮엔 버티기", to: ["night"] }, { label: "잠이 먼저", to: ["morning"] }, { label: "공부는 주말에 확실히", to: ["weekend"] }, { label: "알림이 대신 지켜보기", to: ["alert"] },
    ] },
  ],
};
