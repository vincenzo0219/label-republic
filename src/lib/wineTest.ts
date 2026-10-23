/** 🍷 나의 술 취향은? 1분 테스트 (10/23, 와인·위스키 덕후방 — 커피 테스트와 같은 틀). 맛 취향만, 양·횟수·가격·브랜드 없이. 만 19세 이상. */
export const WINE_INTRO_POST_ID = "6995"; // 와인·위스키 덕후방 "🍷 나의 술 취향 한 줄 자기소개"

export type WineAnswers = {
  red: boolean; // 레드
  heavy: boolean; // 묵직한 바디
  smoky: boolean; // 피트(스모키)
  fruit: boolean; // 과일 향
  pairing: boolean; // 음식 맞춰 봄
  label: boolean; // 라벨 공부
};
export type WineType = { key: string; emoji: string; name: string; what: string };

export const WINE_TYPES: Record<string, WineType> = {
  red: { key: "red", emoji: "🍷", name: "묵직 레드파", what: "진하고 묵직한 맛이 좋아요. 천천히 향을 느끼는 편이에요." },
  peat: { key: "peat", emoji: "🥃", name: "스모키 피트파", what: "훈연 향 한 번 맛보면 못 잊어요. 나무 향, 흙 향이 반가워요." },
  light: { key: "light", emoji: "🥂", name: "가벼운 산뜻파", what: "가볍고 상큼한 게 최고. 과일 향 나는 산뜻한 맛이 좋아요." },
  pair: { key: "pair", emoji: "🧀", name: "페어링 연구파", what: "치즈엔 뭐가 맞을까? 음식이랑 맞춰 보는 게 제일 재밌어요." },
};

/** 질문마다 한 타입에 점수. 동점이면 페어링 연구파 → 스모키 피트파 → 묵직 레드파 → 가벼운 산뜻파 순 */
export function winePick(a: WineAnswers): WineType {
  const s = {
    red: Number(a.red) + Number(a.heavy),
    peat: Number(a.smoky) + Number(!a.fruit),
    light: Number(!a.red) + Number(!a.heavy),
    pair: Number(a.pairing) + Number(a.label),
  };
  const order = ["pair", "peat", "red", "light"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return WINE_TYPES[best]!;
}

export const wineBragLine = (t: WineType) => `🍷 술 취향 테스트: ${t.emoji} ${t.name} / 좋아하는 맛: `;
