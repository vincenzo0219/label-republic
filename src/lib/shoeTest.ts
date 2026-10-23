/** 👟 나는 어떤 신발러? 1분 테스트 (10/23, 신발 덕후방 — 요가·러너 테스트와 같은 틀). 브랜드·가격 없이 신는 습관만. */
export const SHOE_INTRO_POST_ID = "6862"; // 신발 덕후방 "👟 나의 신발 한 줄 자기소개"

export type ShoeAnswers = {
  halfUp: boolean; // 반업
  sneaker: boolean; // 운동화 (아니면 구두·부츠)
  wearOut: boolean; // 닳을 때까지 (아니면 계절마다 새로)
  comfy: boolean; // 편한 게 최고 (아니면 예쁜 게 최고)
  draw: boolean; // 발매일 드로우 응모
  box: boolean; // 박스째 보관
  clean: boolean; // 흰 신발 관리 철저
};
export type ShoeType = { key: string; emoji: string; name: string; what: string };

export const SHOE_TYPES: Record<string, ShoeType> = {
  comfort: { key: "comfort", emoji: "👟", name: "데일리 컴포트파", what: "발 편한 게 최고. 맘에 드는 한 켤레를 밑창 닳을 때까지 신어요." },
  hunter: { key: "hunter", emoji: "🔥", name: "드로우 사냥꾼", what: "발매일 알람은 기본. 당첨 문자 오는 날이 제일 신나요." },
  collector: { key: "collector", emoji: "🧼", name: "클린 콜렉터", what: "박스까지 소중해요. 흰 신발은 늘 새것처럼 닦아 둬요." },
  coordi: { key: "coordi", emoji: "🥾", name: "다재다능 코디파", what: "옷 따라 신발도 바꿔요. 운동화부터 구두·부츠까지 다 있어요." },
};

/** 질문마다 한 타입에 점수. 동점이면 드로우 → 콜렉터 → 코디 → 컴포트 순 */
export function shoePick(a: ShoeAnswers): ShoeType {
  const s = {
    hunter: Number(a.draw) + Number(!a.wearOut),
    collector: Number(a.box) + Number(a.clean),
    coordi: Number(!a.sneaker) + Number(!a.comfy) + Number(!a.halfUp),
    comfort: Number(a.comfy) + Number(a.wearOut) + Number(a.halfUp && a.sneaker),
  };
  const order = ["hunter", "collector", "coordi", "comfort"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return SHOE_TYPES[best]!;
}

export const shoeBragLine = (t: ShoeType) => `👟 신발 테스트: ${t.emoji} ${t.name} / 요즘 자주 신는 것: `;
