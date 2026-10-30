/** 💘 나의 연애 성향 1분 테스트 (10/30 대표님, 💌 미혼남녀 만남 행사 방 — 애니 테스트와 같은 틀). 성향만, 이름·연락처 없이. */
export const LOVE_INTRO_POST_ID = "21866"; // 💌 미혼남녀 만남 행사 수다방

export type LoveAnswers = {
  first: boolean; // 마음에 들면 먼저 연락
  slow: boolean; // 친구로 오래 보고 시작
  talk: boolean; // 대화가 잘 통하는 게 제일
  plan: boolean; // 데이트 코스는 미리 짜요
  reply: boolean; // 답장은 바로바로
  place: boolean; // 첫 만남은 조용한 카페
  sure: boolean; // 확신이 서면 바로 고백
};
export type LoveType = { key: string; emoji: string; name: string; what: string };

export const LOVE_TYPES: Record<string, LoveType> = {
  direct: { key: "direct", emoji: "🔥", name: "직진형", what: "마음에 들면 먼저 다가가요. 밀당보다 솔직한 게 편해요." },
  slow: { key: "slow", emoji: "🐢", name: "천천히 스며드는 형", what: "친구처럼 오래 보며 마음을 열어요. 시작은 느려도 한번 정하면 깊어요." },
  talk: { key: "talk", emoji: "💬", name: "대화 우선형", what: "말이 통하는 게 제일이에요. 밤새 이야기할 수 있는 사람이 좋아요." },
  plan: { key: "plan", emoji: "📅", name: "계획형 데이트러", what: "데이트 코스부터 짜요. 맛집·동선까지 챙기는 게 애정 표현이에요." },
};

/** 질문마다 한 성향에 점수. 동점이면 직진형 → 대화 우선형 → 계획형 → 천천히 순 */
export function lovePick(a: LoveAnswers): LoveType {
  const s = {
    direct: Number(a.first) + Number(a.sure) + Number(a.reply),
    slow: Number(a.slow) + Number(!a.first) + Number(!a.sure),
    talk: Number(a.talk) + Number(a.place),
    plan: Number(a.plan) + Number(!a.talk) + Number(!a.place),
  };
  const order = ["direct", "talk", "plan", "slow"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return LOVE_TYPES[best]!;
}

export const loveBragLine = (t: LoveType) => `💘 연애 성향 테스트: ${t.emoji} ${t.name} / 이상형 한 줄: `;
