/** 👶 나는 어떤 육아 타입? 1분 테스트 (10/23, 육아 덕후방, 커피 테스트와 같은 틀). 부모의 육아 스타일만. 아이 나이·성별·사는 곳, 건강·발달·수면 판단은 묻지도 말하지도 않는다. 결과는 모두 긍정적으로. */
export const PARENT_INTRO_POST_ID = "9663"; // 육아 덕후방 채팅 (10/23 사용자 "자기소개 글은 빼고 채팅창에서 자연스럽게")

export type ParentAnswers = {
  research: boolean; // 사기 전에 후기·비교
  plan: boolean; // 하루 일정 미리
  photo: boolean; // 사진 매일
  diary: boolean; // 메모·다이어리
  outing: boolean; // 주말엔 밖으로
  place: boolean; // 새로운 곳 찾아다님
  easy: boolean; // 계획이 틀어져도 괜찮음
};
export type ParentType = { key: string; emoji: string; name: string; what: string };

export const PARENT_TYPES: Record<string, ParentType> = {
  info: { key: "info", emoji: "🔎", name: "꼼꼼 정보러", what: "새로운 건 먼저 찾아보고 비교해요. 주변에서 자주 물어보러 오는 든든한 정보통이에요." },
  record: { key: "record", emoji: "📸", name: "기록 장인", what: "오늘의 작은 순간도 놓치지 않아요. 차곡차곡 쌓인 사진과 메모가 큰 보물이에요." },
  outing: { key: "outing", emoji: "🚙", name: "나들이 대장", what: "주말이면 어디 갈지부터 찾아요. 새로운 곳에서 함께 웃는 시간이 제일 좋아요." },
  easy: { key: "easy", emoji: "🌿", name: "느긋한 여유파", what: "일정이 바뀌어도 웃으며 넘겨요. 여유로운 분위기로 집 안을 편안하게 만들어요." },
};

/** 질문마다 한 타입에 점수. 동점이면 꼼꼼 정보러 → 기록 장인 → 나들이 대장 → 느긋한 여유파 순 */
export function parentPick(a: ParentAnswers): ParentType {
  const s = {
    info: Number(a.research) + Number(a.plan),
    record: Number(a.photo) + Number(a.diary),
    outing: Number(a.outing) + Number(a.place),
    easy: Number(a.easy) + Number(!a.plan),
  };
  const order = ["info", "record", "outing", "easy"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return PARENT_TYPES[best]!;
}

export const parentBragLine = (t: ParentType) => `👶 육아 타입 테스트: ${t.emoji} ${t.name} / 요즘 고민: `;
