/** 🧘 나는 어떤 요가·필라테스 타입? 1분 테스트 (10/21, 요가·필라테스 덕후방 — 팬 테스트와 같은 틀). 건강·체형 판단 없이 수련 스타일만. */
export const YOGA_INTRO_POST_ID = "6466"; // 요가·필라테스 덕후방 채팅 (10/23 자기소개 글은 빼고 채팅으로)

export type YogaAnswers = { morning: boolean; group: boolean; sweat: boolean; gear: boolean };
export type YogaType = { key: string; emoji: string; name: string; what: string };

export const YOGA_TYPES: Record<string, YogaType> = {
  core: { key: "core", emoji: "💪", name: "코어 집중러", what: "땀 흘리며 버티는 그 1분이 좋아요. 수업 끝나면 개운함이 최고." },
  heal: { key: "heal", emoji: "🕯", name: "힐링 수련러", what: "호흡과 사바아사나를 위해 매트를 펴요. 하루를 내려놓는 시간." },
  mate: { key: "mate", emoji: "👯", name: "클래스 메이트", what: "같이 하는 수업이 좋아요. 선생님·회원들과의 인사가 수련의 반." },
  morning: { key: "morning", emoji: "🌅", name: "아침 루틴러", what: "눈 뜨면 매트부터. 짧아도 매일 하는 게 제 방식이에요." },
  gear: { key: "gear", emoji: "🛍", name: "요가템 수집가", what: "매트·레깅스·소도구 고르는 재미도 수련만큼 좋아요. 팝업은 꼭 들러요." },
};

export function yogaPick(a: YogaAnswers): YogaType {
  if (a.sweat) return YOGA_TYPES.core!;
  if (a.group) return a.gear ? YOGA_TYPES.gear! : YOGA_TYPES.mate!;
  if (a.morning) return YOGA_TYPES.morning!;
  return a.gear ? YOGA_TYPES.gear! : YOGA_TYPES.heal!;
}

export const yogaBragLine = (t: YogaType) => `🧘 요가·필라테스 테스트: ${t.emoji} ${t.name} / 요즘 하는 것: `;
