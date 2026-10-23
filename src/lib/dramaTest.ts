/** 📺 나는 어떤 드라마러? 1분 테스트 (10/23, 드라마 덕후방 — 신발 테스트와 같은 틀). 보는 습관만, 작품 이름·스포 없이. */
export const DRAMA_INTRO_POST_ID = "6877"; // 드라마 덕후방 채팅 (10/23 자기소개 글은 빼고 채팅으로)

export type DramaAnswers = {
  binge: boolean; // 끝나고 몰아서
  live: boolean; // 본방 알람
  spoil: boolean; // 결말 먼저 검색
  quote: boolean; // 대사 캡처
  chat: boolean; // 실시간 반응 구경
  rewatch: boolean; // 좋은 장면 다시 보기
  night: boolean; // 다음 화 자동재생
};
export type DramaType = { key: string; emoji: string; name: string; what: string };

export const DRAMA_TYPES: Record<string, DramaType> = {
  binge: { key: "binge", emoji: "🍿", name: "정주행 몰아보기파", what: "끝난 드라마 모아서 한 번에. 다음 화 누르다 보면 아침이에요." },
  live: { key: "live", emoji: "📺", name: "본방 사수파", what: "방송 시간엔 약속 안 잡아요. 실시간 반응 보면서 같이 보는 맛." },
  ending: { key: "ending", emoji: "🔍", name: "결말부터 찾아보는파", what: "궁금한 건 못 참아요. 결말 알고 봐도 재밌는 사람." },
  quote: { key: "quote", emoji: "✍️", name: "명대사 수집파", what: "마음에 남는 대사는 캡처해 둬요. 메모장에 한 줄씩 쌓여요." },
};

/** 질문마다 한 타입에 점수. 동점이면 결말부터 찾아보는파 → 명대사 수집파 → 본방 사수파 → 정주행 몰아보기파 순 */
export function dramaPick(a: DramaAnswers): DramaType {
  const s = {
    binge: Number(a.binge) + Number(a.night),
    live: Number(!a.binge) + Number(a.live) + Number(a.chat),
    ending: 2 * Number(a.spoil),
    quote: Number(a.quote) + Number(a.rewatch),
  };
  const order = ["ending", "quote", "live", "binge"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return DRAMA_TYPES[best]!;
}

export const dramaBragLine = (t: DramaType) => `📺 드라마 테스트: ${t.emoji} ${t.name} / 요즘 보는 드라마: `;
