import type { TypeTest } from "./engine";

/** 📈 투자 생활 성향 (11/2, 주식방). 공부·정보·기록 습관만. 종목·수익 이야기는 없다 */
export const STOCK_TEST: TypeTest = {
  key: "stock-life",
  room: "주식",
  roomName: "주식방",
  emoji: "📈",
  title: "투자 생활 성향 테스트",
  resultLabel: "나의 투자 생활 성향",
  intro: "투자와 함께하는 하루 습관으로 나의 성향을 알아봐요. 종목 이야기는 없어요.",
  description: "공부파? 뉴스파? 장기파? 기록파? 질문 6개로 알아보는 나의 투자 생활 습관.",
  note: "생활 습관을 재미로 나눈 결과예요. 종목 추천이 아니에요.",
  types: [
    { key: "study", emoji: "📚", name: "공부파", what: "보고서와 책으로 먼저 공부해요. 모르는 건 안 하는 게 원칙이에요." },
    { key: "news", emoji: "📰", name: "뉴스파", what: "아침 뉴스와 일정표로 하루를 시작해요. 시장 소식이 제일 빨라요." },
    { key: "long", emoji: "🌳", name: "장기파", what: "자주 보지 않고 길게 가요. 앱은 한 달에 몇 번만 열어요." },
    { key: "log", emoji: "📒", name: "기록파", what: "왜 샀는지, 왜 팔았는지 적어 둬요. 일지가 제일 좋은 선생님이에요." },
  ],
  questions: [
    { q: "아침에 제일 먼저 보는 건?", options: [
      { label: "경제 뉴스", to: ["news"] }, { label: "읽던 책·보고서", to: ["study"] }, { label: "아무것도 안 봐요", to: ["long"] }, { label: "어제 쓴 메모", to: ["log"] },
    ] },
    { q: "관심 가는 회사가 생기면?", options: [
      { label: "사업 보고서부터 읽어요", to: ["study"] }, { label: "관련 뉴스를 찾아봐요", to: ["news"] }, { label: "몇 년 뒤를 떠올려요", to: ["long"] }, { label: "이유를 한 줄 적어 둬요", to: ["log"] },
    ] },
    { q: "시장이 크게 흔들린 날?", options: [
      { label: "왜 그런지 공부해요", to: ["study"] }, { label: "속보를 계속 봐요", to: ["news"] }, { label: "앱을 안 열어요", to: ["long"] }, { label: "그날 기분을 기록해요", to: ["log"] },
    ] },
    { q: "주말에는?", options: [
      { label: "책 한 권", to: ["study", "long"] }, { label: "다음 주 일정 확인", to: ["news"] }, { label: "한 주 돌아보기", to: ["log"] },
    ] },
    { q: "방에 남기고 싶은 글은?", options: [
      { label: "공부한 내용 정리", to: ["study"] }, { label: "오늘의 일정·소식", to: ["news"] }, { label: "몇 년째 하는 이야기", to: ["long"] }, { label: "매매일지", to: ["log"] },
    ] },
    { q: "나에게 필요한 건?", options: [
      { label: "좋은 자료", to: ["study"] }, { label: "빠른 소식", to: ["news"] }, { label: "인내심", to: ["long"] }, { label: "꾸준한 기록", to: ["log"] },
    ] },
  ],
};
