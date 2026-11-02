import type { TypeTest } from "./engine";

/**
 * ⚾ 내 인생 구단 찾기 (11/2). 질문 8개 → KBO 10개 구단 중 하나. 구단 성적·사건 이야기 없이 연고 도시 분위기·유니폼 색처럼
 * 누구나 아는 중립적인 특징만, 재미로. 모든 구단은 질문마다 좋아하는 보기가 하나씩 있고(8자리 서로 다름) 그대로 고르면 그 구단이 나온다.
 *
 *            Q1 Q2 Q3 Q4 Q5 Q6 Q7 Q8
 *   kia       b  a  a  a  a  a  d  a
 *   samsung   b  b  c  a  a  a  c  b
 *   lg        c  c  a  b  d  d  b  c
 *   doosan    c  b  b  b  c  d  c  c
 *   kt        d  d  c  c  b  d  b  c
 *   ssg       a  c  c  c  d  c  b  a
 *   lotte     a  a  a  b  a  c  d  b
 *   hanwha    b  b  a  a  c  a  a  d
 *   nc        d  d  b  d  b  d  c  c
 *   kiwoom    c  c  d  c  b  b  d  a
 */
export const KBO_TEST: TypeTest = {
  key: "kbo-team",
  room: "kbo-덕후방",
  roomName: "KBO 덕후방",
  emoji: "⚾",
  title: "내 인생 구단 찾기",
  resultLabel: "나와 어울리는 구단",
  intro: "나와 닮은 KBO 구단이 나와요. 재미로만 봐 주세요.",
  description: "주말 여행지, 응원 스타일, 좋아하는 경기로 찾는 나와 닮은 KBO 구단. 질문 8개, 1분이면 나와요.",
  note: "도시 분위기와 유니폼 색으로 재미 삼아 고른 결과예요. 응원 팀은 마음 가는 대로!",
  types: [
    { key: "kia", emoji: "🐯", name: "KIA 타이거즈", what: "광주의 맛과 정이 어울리는 사람. 응원도 밥도 진심인 타입이에요." },
    { key: "samsung", emoji: "🦁", name: "삼성 라이온즈", what: "대구의 뜨거운 여름처럼 한결같은 사람. 꾸준함이 무기예요." },
    { key: "lg", emoji: "⚡", name: "LG 트윈스", what: "잠실의 도시 감성이 어울리는 사람. 세련된 응원과 핀스트라이프가 잘 맞아요." },
    { key: "doosan", emoji: "🐻", name: "두산 베어스", what: "끈기와 팀워크를 아는 사람. 끝까지 뛰는 경기를 좋아해요." },
    { key: "kt", emoji: "🧙", name: "KT 위즈", what: "수원의 새로운 에너지가 어울리는 사람. 새것과 기술을 반기는 타입이에요." },
    { key: "ssg", emoji: "🛬", name: "SSG 랜더스", what: "인천 바닷바람과 즐길 거리를 좋아하는 사람. 야구장을 놀이터처럼 즐겨요." },
    { key: "lotte", emoji: "⚓", name: "롯데 자이언츠", what: "부산 바다처럼 시원하게 노래하는 사람. 응원가 떼창이 제일 신나요." },
    { key: "hanwha", emoji: "🦅", name: "한화 이글스", what: "대전의 의리가 어울리는 사람. 한번 정하면 끝까지 응원하는 뚝심이 있어요." },
    { key: "nc", emoji: "🦖", name: "NC 다이노스", what: "창원의 깔끔한 새 구장처럼 정돈된 사람. 기록 보는 재미를 알아요." },
    { key: "kiwoom", emoji: "🦸", name: "키움 히어로즈", what: "날씨 걱정 없는 고척돔처럼 편한 사람. 젊은 선수가 크는 걸 보는 게 즐거워요." },
  ],
  questions: [
    { q: "주말에 놀러 간다면?", options: [
      { label: "바다가 보이는 도시", to: ["ssg", "lotte"] },
      { label: "맛집 많은 동네", to: ["kia", "samsung", "hanwha"] },
      { label: "서울 도심 핫플", to: ["lg", "doosan", "kiwoom"] },
      { label: "새로 생긴 깔끔한 공간", to: ["kt", "nc"] },
    ] },
    { q: "응원할 때 나는?", options: [
      { label: "목청껏 노래해요", to: ["kia", "lotte"] },
      { label: "묵묵히 끝까지 봐요", to: ["samsung", "doosan", "hanwha"] },
      { label: "사진·영상을 남겨요", to: ["lg", "ssg", "kiwoom"] },
      { label: "기록을 보며 분석해요", to: ["kt", "nc"] },
    ] },
    { q: "제일 짜릿한 경기는?", options: [
      { label: "9회 역전승", to: ["kia", "lg", "lotte", "hanwha"] },
      { label: "팽팽한 투수전", to: ["doosan", "nc"] },
      { label: "홈런이 쏟아지는 타격전", to: ["samsung", "kt", "ssg"] },
      { label: "신인이 활약한 경기", to: ["kiwoom"] },
    ] },
    { q: "야구장 먹거리는?", options: [
      { label: "그 지역 명물", to: ["kia", "samsung", "hanwha"] },
      { label: "치킨에 시원한 음료", to: ["lg", "doosan", "lotte"] },
      { label: "새 메뉴에 도전", to: ["kt", "ssg", "kiwoom"] },
      { label: "간단히 김밥", to: ["nc"] },
    ] },
    { q: "끌리는 팀 분위기는?", options: [
      { label: "전통과 역사", to: ["kia", "samsung", "lotte"] },
      { label: "젊고 새로운", to: ["kt", "nc", "kiwoom"] },
      { label: "끈끈한 팀워크", to: ["doosan", "hanwha"] },
      { label: "화려한 볼거리", to: ["lg", "ssg"] },
    ] },
    { q: "야구 보기 좋은 날씨는?", options: [
      { label: "더워도 좋아요", to: ["kia", "samsung", "hanwha"] },
      { label: "비 걱정 없는 실내", to: ["kiwoom"] },
      { label: "바닷바람 부는 밤", to: ["ssg", "lotte"] },
      { label: "선선한 저녁", to: ["lg", "doosan", "kt", "nc"] },
    ] },
    { q: "친구들이 말하는 나는?", options: [
      { label: "의리파", to: ["hanwha"] },
      { label: "트렌디한 사람", to: ["lg", "kt", "ssg"] },
      { label: "성실한 사람", to: ["samsung", "doosan", "nc"] },
      { label: "분위기 메이커", to: ["kia", "lotte", "kiwoom"] },
    ] },
    { q: "입고 싶은 유니폼 색은?", options: [
      { label: "빨강·버건디", to: ["kia", "ssg", "kiwoom"] },
      { label: "파랑", to: ["samsung", "lotte"] },
      { label: "검정·남색", to: ["lg", "doosan", "kt", "nc"] },
      { label: "주황", to: ["hanwha"] },
    ] },
  ],
};
