/** 🎮 나는 어떤 게이머? 1분 테스트 (10/23, 게임 덕후방 — 신발 테스트와 같은 틀). 게임 습관만, 게임 이름·가격 없이. */
export const GAME_INTRO_POST_ID = "6865"; // 게임 덕후방 "🎮 나의 게임 한 줄 자기소개"

export type GameAnswers = {
  rank: boolean; // 랭크 위주
  story: boolean; // 스토리 게임
  night: boolean; // 밤새 하는 편
  friends: boolean; // 친구랑 같이
  voice: boolean; // 보이스챗 켜고
  phone: boolean; // 폰으로
  short: boolean; // 틈틈이 짧게
};
export type GameType = { key: string; emoji: string; name: string; what: string };

export const GAME_TYPES: Record<string, GameType> = {
  rank: { key: "rank", emoji: "🏆", name: "랭크 올인파", what: "티어 올리는 맛에 해요. 한 판만 더가 매일 밤 반복돼요." },
  story: { key: "story", emoji: "🌙", name: "밤샘 스토리파", what: "이야기에 빠지면 못 끊어요. 엔딩 보고 나면 새벽이에요." },
  party: { key: "party", emoji: "🤝", name: "친구랑 파티파", what: "혼자 하면 재미 반. 보이스챗 켜고 떠드는 게 반이에요." },
  mobile: { key: "mobile", emoji: "📱", name: "틈새 폰겜파", what: "출근길, 점심시간, 자기 전 10분. 틈만 나면 폰 켜요." },
};

/** 질문마다 한 타입에 점수. 동점이면 랭크 올인파 → 친구랑 파티파 → 밤샘 스토리파 → 틈새 폰겜파 순 */
export function gamePick(a: GameAnswers): GameType {
  const s = {
    rank: Number(a.rank) + Number(!a.story),
    story: Number(a.night) + Number(a.story) + Number(!a.friends),
    party: Number(a.friends) + Number(a.voice),
    mobile: Number(a.phone) + Number(a.short),
  };
  const order = ["rank", "party", "story", "mobile"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return GAME_TYPES[best]!;
}

export const gameBragLine = (t: GameType) => `🎮 게임 테스트: ${t.emoji} ${t.name} / 요즘 하는 게임: `;
