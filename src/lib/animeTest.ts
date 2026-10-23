/** 🎨 나는 어떤 오타쿠? 1분 테스트 (10/23, 애니·만화 덕후방 — 신발 테스트와 같은 틀). 덕질 습관만, 작품 이름·가격 없이. */
export const ANIME_INTRO_POST_ID = "5362"; // 애니·만화 덕후방 "🎨 요즘 보는 작품 하나만 알려 주세요" (따로 자기소개 글이 없어 이 글에)

export type AnimeAnswers = {
  goods: boolean; // 굿즈 사요
  binge: boolean; // 하루에 몰아보기
  manga: boolean; // 원작 먼저
  event: boolean; // 행사 챙겨 감
  cosplay: boolean; // 코스프레 관심
  next: boolean; // 다음 내용 원작으로
  shelf: boolean; // 굿즈 진열장
};
export type AnimeType = { key: string; emoji: string; name: string; what: string };

export const ANIME_TYPES: Record<string, AnimeType> = {
  goods: { key: "goods", emoji: "🛍️", name: "굿즈 수집가", what: "아크릴 스탠드 하나에 행복해져요. 진열장이 점점 좁아져요." },
  binge: { key: "binge", emoji: "📺", name: "정주행 시청파", what: "한 작품 잡으면 끝까지 달려요. 완결작 몰아보는 날이 제일 좋아요." },
  manga: { key: "manga", emoji: "📖", name: "원작 만화파", what: "애니 나오기 전에 원작부터. 다음 내용 알고 봐도 재밌어요." },
  event: { key: "event", emoji: "🎭", name: "코스프레·행사파", what: "행사 일정부터 챙겨요. 현장 분위기가 제일 신나요." },
};

/** 질문마다 한 타입에 점수. 동점이면 코스프레·행사파 → 굿즈 수집가 → 원작 만화파 → 정주행 시청파 순 */
export function animePick(a: AnimeAnswers): AnimeType {
  const s = {
    goods: Number(a.goods) + Number(a.shelf),
    binge: Number(a.binge) + Number(!a.next),
    manga: Number(a.manga) + Number(a.next) + Number(!a.shelf),
    event: Number(a.event) + Number(a.cosplay),
  };
  const order = ["event", "goods", "manga", "binge"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return ANIME_TYPES[best]!;
}

export const animeBragLine = (t: AnimeType) => `🎨 애니·만화 테스트: ${t.emoji} ${t.name} / 요즘 보는 작품: `;
