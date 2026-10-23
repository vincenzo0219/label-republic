/** ⚖️ 나의 토론 스타일은? 1분 테스트 (10/23, AI 밸런스 토론방 — 커피 테스트와 같은 틀). 말다툼하는 방식만. */
export const DEBATE_TEST_POST_ID = "1587"; // AI 밸런스 토론방 "⚖️ 부먹 vs 찍먹" (따로 자기소개 글이 없어 첫 토론 글에)

export type DebateAnswers = {
  evidence: boolean; // 자료부터 찾음
  empathy: boolean; // "그럴 수 있지"부터
  last: boolean; // 끝까지 반박
  flip: boolean; // 반대편도 해 봄
  calm: boolean; // 험해지면 정리
  facts: boolean; // 숫자·사례 챙김
  fun: boolean; // 새 관점이 재밌음
};
export type DebateType = { key: string; emoji: string; name: string; what: string };

export const DEBATE_TYPES: Record<string, DebateType> = {
  logic: { key: "logic", emoji: "🧠", name: "근거 들이미는 논리파", what: "말보다 근거. 출처 하나 꺼내면 대화가 정리돼요." },
  mediator: { key: "mediator", emoji: "🤝", name: "공감부터 하는 중재파", what: "일단 \"그럴 수 있지\"부터. 양쪽 다 고개 끄덕이게 만들어요." },
  fighter: { key: "fighter", emoji: "🔥", name: "끝까지 반박하는 승부사", what: "질 것 같아도 한 번 더. 마지막 말은 내가 해요." },
  devil: { key: "devil", emoji: "😈", name: "악마의 변호인", what: "일부러 반대편에 서 봐요. 그래야 진짜 답이 보이거든요." },
};

/** 질문마다 한 타입에 점수. 동점이면 악마의 변호인 → 중재파 → 논리파 → 승부사 순 */
export function debatePick(a: DebateAnswers): DebateType {
  const s = {
    logic: Number(a.evidence) + Number(a.facts),
    mediator: Number(a.empathy) + Number(a.calm),
    fighter: Number(a.last) + Number(!a.fun),
    devil: Number(a.flip) + Number(a.fun),
  };
  const order = ["devil", "mediator", "logic", "fighter"] as const;
  const best = order.reduce((b, k) => (s[k] > s[b] ? k : b), order[0]);
  return DEBATE_TYPES[best]!;
}

export const debateBragLine = (t: DebateType) => `⚖️ 토론 스타일 테스트: ${t.emoji} ${t.name} / 부먹 찍먹 내 선택: `;
