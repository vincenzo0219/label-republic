/** ☕ 나는 어떤 커피러? 1분 테스트 (10/23, 커피 덕후방 — 신발 테스트와 같은 틀). 마시는 습관만, 브랜드·가격 없이. */
export const COFFEE_INTRO_POST_ID = "6868"; // 커피 덕후방 "☕ 나의 커피 한 줄 자기소개"

export type CoffeeAnswers = {
  ice: boolean; // 겨울에도 아아
  sweet: boolean; // 달달한 메뉴
  beans: boolean; // 원두 골라 마심
  home: boolean; // 집에서 직접
  space: boolean; // 분위기 먼저
  takeout: boolean; // 테이크아웃
  milk: boolean; // 우유 들어간 커피
};
export type CoffeeType = { key: string; emoji: string; name: string; what: string };

export const COFFEE_TYPES: Record<string, CoffeeType> = {
  ice: { key: "ice", emoji: "🧊", name: "아아 직진파", what: "계절 상관없이 아아. 고민 없이 주문하고 바로 나가요." },
  drip: { key: "drip", emoji: "🫖", name: "핸드드립 탐험가", what: "원두 고르는 게 제일 재밌어요. 오늘은 어떤 향일지 기대돼요." },
  latte: { key: "latte", emoji: "🥛", name: "달달 라떼파", what: "커피는 부드럽고 달아야 맛. 한 모금에 기분이 풀려요." },
  space: { key: "space", emoji: "🪴", name: "카페 공간파", what: "커피만큼 자리가 중요해요. 창가 자리 하나면 반나절 뚝딱." },
};

/** 질문마다 한 타입에 점수. 동점이면 핸드드립 탐험가 → 카페 공간파 → 달달 라떼파 → 아아 직진파 순 */
export function coffeePick(a: CoffeeAnswers): CoffeeType {
  const s = {
    ice: Number(a.ice) + Number(a.takeout),
    drip: Number(a.beans) + Number(a.home),
    latte: Number(a.sweet) + Number(a.milk),
    space: Number(a.space) + Number(!a.takeout),
  };
  const order = ["drip", "space", "latte", "ice"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return COFFEE_TYPES[best]!;
}

export const coffeeBragLine = (t: CoffeeType) => `☕ 커피 테스트: ${t.emoji} ${t.name} / 요즘 마시는 커피: `;
