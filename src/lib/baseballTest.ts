/** ⚾ 나는 어떤 야구 팬? 1분 테스트 (10/21, KBO 덕후방 — K리그 팬 테스트와 같은 틀). 구단·기록 같은 사실 없이 응원 스타일만. */
export const BASEBALL_INTRO_POST_ID = "5358"; // KBO 덕후방 "⚾ 응원하는 팀 한 줄 자기소개"

export type BaseballAnswers = { stadium: boolean; cheer: boolean; analysis: boolean; goods: boolean };
export type BaseballType = { key: string; emoji: string; name: string; what: string };

export const BASEBALL_TYPES: Record<string, BaseballType> = {
  cheer: { key: "cheer", emoji: "📣", name: "직관 응원단", what: "응원가·응원 동작 다 따라 하며 9회까지 서서 응원해요. 목이 쉬어야 이긴 경기." },
  food: { key: "food", emoji: "🍗", name: "야구장 먹방러", what: "치킨·맥주·떡볶이까지 야구장 먹거리는 다 꿰고 있어요. 경기와 먹방을 같이 즐기는 타입." },
  analyst: { key: "analyst", emoji: "📊", name: "기록 분석가", what: "타율·OPS·투구 수까지 챙겨 보는 타입. 경기 끝나면 기록지부터 펼쳐요." },
  collector: { key: "collector", emoji: "🧢", name: "굿즈 수집가", what: "유니폼·모자·응원 도구가 시즌마다 늘어나요. 마킹 고민이 제일 즐거워요." },
  home: { key: "home", emoji: "📺", name: "집관 응원단", what: "중계 켜 놓고 편하게 응원해요. 홈런 나오면 거실이 야구장." },
};

export function baseballPick(a: BaseballAnswers): BaseballType {
  if (a.stadium) return a.cheer ? BASEBALL_TYPES.cheer! : BASEBALL_TYPES.food!;
  if (a.analysis) return BASEBALL_TYPES.analyst!;
  return a.goods ? BASEBALL_TYPES.collector! : BASEBALL_TYPES.home!;
}

// "응원 구단:" — K리그 결과의 "응원 팀:" 과 갈라 세려고 (peers.teamOf)
export const baseballBragLine = (t: BaseballType) => `⚾ 야구 팬 테스트: ${t.emoji} ${t.name} / 응원 구단: `;
