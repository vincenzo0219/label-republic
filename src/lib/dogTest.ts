/** 🐶 나는 어떤 견주? 1분 테스트 (Sprint 91, 반려견 덕후방 기본 세트). 건강·훈련 조언 없이 생활 스타일만. */
export const DOG_INTRO_POST_ID = "3173"; // 반려견 덕후방 채팅 (10/23 자기소개 글은 빼고 채팅으로)

export type DogAnswers = { walkTwice: boolean; labels: boolean; travel: boolean; photos: boolean };
export type DogType = { key: string; emoji: string; name: string; what: string };

export const DOG_TYPES: Record<string, DogType> = {
  labels: { key: "labels", emoji: "🔍", name: "성분표 박사", what: "사료·간식 뒷면부터 보는 타입. 원료 순서와 함량을 꼼꼼히 비교해요." },
  travel: { key: "travel", emoji: "🧳", name: "여행 메이트", what: "카페, 캠핑, 여행까지 어디든 같이 가요. 반려견 동반 장소 지도가 머릿속에." },
  walker: { key: "walker", emoji: "🦮", name: "산책왕", what: "하루 두 번 이상 산책은 기본. 동네 산책 코스는 전부 꿰고 있어요." },
  photo: { key: "photo", emoji: "📸", name: "전속 사진작가", what: "갤러리 절반이 우리 개. 오늘도 인생샷을 건지는 중이에요." },
  home: { key: "home", emoji: "🏠", name: "집콕 단짝", what: "집에서 같이 뒹구는 시간이 제일 행복한 타입. 소파가 둘의 아지트." },
};

export function dogPick(a: DogAnswers): DogType {
  if (a.labels) return DOG_TYPES.labels!;
  if (a.travel) return DOG_TYPES.travel!;
  if (a.walkTwice) return DOG_TYPES.walker!;
  return a.photos ? DOG_TYPES.photo! : DOG_TYPES.home!;
}

export const dogBragLine = (t: DogType) => `🐶 견주 타입 테스트: ${t.emoji} ${t.name} / 우리 개: `;
