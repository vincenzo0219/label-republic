/** ⚽ 나는 어떤 축구 팬? 1분 테스트 (Sprint 91, K리그 덕후방 기본 세트). 팀·기록 같은 사실 없이 응원 스타일만. */
export const FAN_INTRO_POST_ID = "3121";

export type FanAnswers = { stadium: boolean; away: boolean; analysis: boolean; goods: boolean };
export type FanType = { key: string; emoji: string; name: string; what: string };

export const FAN_TYPES: Record<string, FanType> = {
  away: { key: "away", emoji: "🚌", name: "원정 직관러", what: "홈이든 원정이든 팀이 가는 곳이면 따라가요. 경기장 근처 맛집은 다 꿰고 있어요." },
  ultra: { key: "ultra", emoji: "📣", name: "직관 응원단", what: "경기장에서 응원가 부르며 90분을 함께 뛰어요. 목소리가 곧 12번째 선수." },
  analyst: { key: "analyst", emoji: "📊", name: "전술 분석가", what: "포메이션, 교체 타이밍, 기록까지 챙겨 보는 타입. 경기 후 복기가 진짜 경기." },
  collector: { key: "collector", emoji: "👕", name: "굿즈 수집가", what: "시즌마다 유니폼, 머플러, 사인볼이 늘어나요. 옷장이 팀 컬러." },
  sofa: { key: "sofa", emoji: "🛋", name: "소파 응원단", what: "중계 켜 놓고 편하게 응원해요. 골 들어가면 거실이 경기장." },
};

export function fanPick(a: FanAnswers): FanType {
  if (a.stadium) return a.away ? FAN_TYPES.away! : FAN_TYPES.ultra!;
  if (a.analysis) return FAN_TYPES.analyst!;
  return a.goods ? FAN_TYPES.collector! : FAN_TYPES.sofa!;
}

export const fanBragLine = (t: FanType) => `⚽ 축구 팬 테스트: ${t.emoji} ${t.name} / 응원 팀: `;
