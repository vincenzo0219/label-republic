import type { TypeTest } from "./engine";

/**
 * 📚 문장 취향 테스트 (11/2 대표님 허락, Readme 앱에서 얻은 생각). 문장 12쌍은 모두 이 사이트가 새로 쓴 것 (책 인용 아님).
 * 쌍마다 더 끌리는 문장 하나 → 6가지 독서 타입
 */
export const BOOK_TEST: TypeTest = {
  key: "book-sentence",
  room: "읽는-책-제목을-교환해-보자",
  roomName: "책 덕후방",
  emoji: "📚",
  title: "문장 취향 테스트",
  resultLabel: "나의 문장 취향",
  intro: "두 문장 중 더 끌리는 쪽을 골라요. 12번이면 나의 독서 타입이 나와요.",
  description: "두 문장 중 더 끌리는 쪽만 고르면 돼요. 12번 고르면 나의 독서 타입이 나와요.",
  long: true,
  types: [
    { key: "lyric", emoji: "🌧️", name: "서정파", what: "풍경과 감정이 번지는 문장에 오래 머물러요. 밑줄이 제일 많은 타입이에요." },
    { key: "epic", emoji: "🗺️", name: "서사파", what: "큰 이야기와 긴 여정을 좋아해요. 두꺼운 책도 끝까지 가는 힘이 있어요." },
    { key: "muse", emoji: "🤔", name: "사색파", what: "한 문장을 읽고 한참 생각해요. 질문을 남기는 책이 좋은 책이에요." },
    { key: "humor", emoji: "😂", name: "유머파", what: "웃기는 문장 하나에 하루가 가벼워져요. 친구에게 사진 찍어 보내는 타입이에요." },
    { key: "mystery", emoji: "🔍", name: "미스터리파", what: "첫 장의 수상한 한 줄에 끌려요. 범인을 맞힐 때까지 책을 못 덮어요." },
    { key: "practical", emoji: "🧰", name: "실용파", what: "읽고 나서 바로 써먹을 수 있는 문장이 좋아요. 메모 앱이 늘 열려 있어요." },
  ],
  questions: [
    { q: "더 끌리는 문장은?", options: [{ label: "창밖의 비가 오래된 편지처럼 천천히 번져 갔다.", to: ["lyric"] }, { label: "그해 겨울, 세 가문의 운명은 배 한 척에 실렸다.", to: ["epic"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "우리는 왜 지나간 일만 또렷하게 기억할까.", to: ["muse"] }, { label: "알람을 끈 건 나였지만, 범인은 이불이었다.", to: ["humor"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "문은 안에서 잠겨 있었고, 열쇠는 식탁 위에 있었다.", to: ["mystery"] }, { label: "아침 10분을 바꾸면 하루의 순서가 달라진다.", to: ["practical"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "골목 끝 가로등이 나 대신 오래 기다려 주었다.", to: ["lyric"] }, { label: "혼자 있는 시간은 나를 비우는 시간일까, 채우는 시간일까.", to: ["muse"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "소년은 지도에 없는 섬을 찾아 열일곱 번째 항해를 떠났다.", to: ["epic"] }, { label: "사진 속 다섯 명 중 한 명은 그날 그곳에 없었다.", to: ["mystery"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "다이어트는 내일부터라고, 어제의 나도 말했다.", to: ["humor"] }, { label: "할 일이 많을 때는 가장 작은 일부터 끝낸다.", to: ["practical"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "봄은 늘 예고 없이 와서 인사도 없이 간다.", to: ["lyric"] }, { label: "고양이는 내가 사 준 장난감보다 그 상자를 더 사랑했다.", to: ["humor"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "무너진 성벽 위에서 그녀는 다시 깃발을 올렸다.", to: ["epic"] }, { label: "좋은 질문 하나가 긴 회의를 짧게 만든다.", to: ["practical"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "가장 멀리 간 생각은 결국 처음 자리로 돌아온다.", to: ["muse"] }, { label: "그가 남긴 마지막 메모에는 날짜 하나만 적혀 있었다.", to: ["mystery"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "첫눈 오는 날의 약속은 아무도 지키지 않아도 따뜻했다.", to: ["lyric"] }, { label: "통장을 셋으로 나누자 돈이 어디로 가는지 보이기 시작했다.", to: ["practical"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "백 년 뒤의 아이들은 그날의 선택을 전설이라 불렀다.", to: ["epic"] }, { label: "회식 메뉴를 정하는 데 세 시간이 걸렸고, 결국 김밥이었다.", to: ["humor"] }] },
    { q: "더 끌리는 문장은?", options: [{ label: "좋은 하루였는지는 잠들기 직전에야 알 수 있다.", to: ["muse"] }, { label: "모두가 잠든 새벽 세 시, 엘리베이터가 혼자 13층에 멈췄다.", to: ["mystery"] }] },
  ],
};
