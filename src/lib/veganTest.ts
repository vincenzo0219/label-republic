/**
 * 🌱 나는 어떤 채식 타입? 1분 테스트 (Sprint 88, 비건 덕후방 기본 세트). 먹는 것 네 가지로 채식 단계를 알려 준다.
 * 건강 조언은 하지 않고 이름과 일반적인 뜻만 보여 준다.
 */
export const VEGAN_INTRO_POST_ID = "2751";

export type VeganAnswers = { meat: boolean; fish: boolean; dairyEgg: boolean; beyondFood: boolean };

export type VeganType = { key: string; emoji: string; name: string; what: string };

export const VEGAN_TYPES: Record<string, VeganType> = {
  flexi: { key: "flexi", emoji: "🥗", name: "플렉시테리언", what: "평소엔 채식, 가끔은 고기도 먹어요. 줄여 가는 것도 채식의 시작이에요." },
  pesco: { key: "pesco", emoji: "🐟", name: "페스코 베지테리언", what: "고기는 안 먹고 생선·해산물, 유제품·달걀은 먹어요." },
  lactoOvo: { key: "lactoOvo", emoji: "🥚", name: "락토오보 베지테리언", what: "고기·생선은 안 먹고 유제품과 달걀은 먹어요." },
  vegan: { key: "vegan", emoji: "🌱", name: "비건", what: "고기·생선·유제품·달걀 등 동물성 식품을 먹지 않아요." },
  lifestyle: { key: "lifestyle", emoji: "🌍", name: "라이프스타일 비건", what: "먹는 것뿐 아니라 옷·화장품까지 동물성 원료를 피하는 쪽이에요." },
};

export function veganPick(a: VeganAnswers): VeganType {
  if (a.meat) return VEGAN_TYPES.flexi!;
  if (a.fish) return VEGAN_TYPES.pesco!;
  if (a.dairyEgg) return VEGAN_TYPES.lactoOvo!;
  return a.beyondFood ? VEGAN_TYPES.lifestyle! : VEGAN_TYPES.vegan!;
}

export const veganBragLine = (t: VeganType) => `🌱 채식 타입 테스트: ${t.emoji} ${t.name} / 채식 시작한 지: `;
