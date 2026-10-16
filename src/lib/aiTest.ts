/**
 * 🤖 AI 판별 테스트 (Sprint 68) — "진짜 시인의 문장 vs AI가 흉내 낸 문장" 10쌍에서 진짜(사람)를 고른다.
 * 사람 쪽은 저작권이 끝난 한국 근대 시·소설의 실제 문장(작가 사망 후 보호기간 경과), AI 쪽은 노방장의 AI가
 * 같은 분위기로 새로 쓴 문장이다 — 양쪽 다 출처가 분명하다. AI 덕후방의 입구.
 */
export type AiPair = { human: string; ai: string; author: string; work: string; tell: string };

export const AI_PAIRS: readonly AiPair[] = [
  { human: "죽는 날까지 하늘을 우러러 / 한 점 부끄럼이 없기를,", ai: "살아가는 날까지 별을 바라보며 / 한 줌 후회도 남기지 않기를,", author: "윤동주", work: "서시", tell: "AI는 '별·후회'처럼 익숙한 낱말을 고르게 늘어놓는 편이에요" },
  { human: "나 보기가 역겨워 / 가실 때에는 / 말없이 고이 보내 드리우리다", ai: "내 얼굴이 서러워 / 떠나실 때에는 / 아무 말 없이 길을 내어 드리리다", author: "김소월", work: "진달래꽃", tell: "'역겨워'처럼 거칠고 낯선 말을 AI는 잘 쓰지 않아요" },
  { human: "님은 갔습니다. 아아 사랑하는 나의 님은 갔습니다.", ai: "님은 떠났습니다. 아아 그리운 나의 님은 멀리 떠났습니다.", author: "한용운", work: "님의 침묵", tell: "AI는 '멀리'처럼 뜻을 한 번 더 설명하는 말을 덧붙이곤 해요" },
  { human: "별 하나에 추억과 / 별 하나에 사랑과 / 별 하나에 쓸쓸함과", ai: "별 하나에 그리움과 / 별 하나에 기다림과 / 별 하나에 고요함과", author: "윤동주", work: "별 헤는 밤", tell: "사람은 '쓸쓸함'처럼 흐름을 깨는 단어를 넣고, AI는 결이 비슷한 말만 고르는 편이에요" },
  { human: "산에는 꽃 피네 / 꽃이 피네 / 갈 봄 여름 없이 / 꽃이 피네", ai: "들에는 꽃 피네 / 꽃이 피네 / 봄 여름 가을 내내 / 꽃이 피네", author: "김소월", work: "산유화", tell: "'갈 봄 여름'처럼 순서를 비트는 건 사람의 솜씨예요 — AI는 '봄 여름 가을'로 반듯하게 써요" },
  { human: "까마득한 날에 / 하늘이 처음 열리고 / 어데 닭 우는 소리 들렸으랴", ai: "아득한 옛날에 / 하늘이 처음 열리고 / 어디선가 새벽닭이 울었으리라", author: "이육사", work: "광야", tell: "'어데'·'들렸으랴'의 사투리와 반문을 AI는 표준어 서술로 고쳐 버려요" },
  { human: "넓은 벌 동쪽 끝으로 / 옛이야기 지줄대는 실개천이 회돌아 나가고,", ai: "너른 들판 동쪽 끝으로 / 옛이야기 속삭이는 작은 시내가 굽이쳐 흐르고,", author: "정지용", work: "향수", tell: "'지줄대는'·'회돌아' 같은 시인의 말을 AI는 '속삭이는'·'굽이쳐'로 무난하게 바꿔요" },
  { human: "지금은 남의 땅 — 빼앗긴 들에도 봄은 오는가?", ai: "이제는 남의 땅 — 잃어버린 들판에도 봄은 다시 찾아올까?", author: "이상화", work: "빼앗긴 들에도 봄은 오는가", tell: "'빼앗긴'처럼 날 선 말을 AI는 '잃어버린'으로 부드럽게 바꾸는 편이에요" },
  { human: "산모퉁이를 돌아 논가 외딴 우물을 홀로 찾아가선 가만히 들여다봅니다.", ai: "언덕길을 돌아 마을 끝 오래된 우물을 혼자 찾아가 조용히 들여다봅니다.", author: "윤동주", work: "자화상", tell: "AI는 '오래된'처럼 장면을 친절하게 설명하는 꾸밈말을 붙여요" },
  { human: "모란이 피기까지는 / 나는 아직 나의 봄을 기다리고 있을 테요", ai: "목련이 피기까지는 / 나는 여전히 나만의 봄을 기다리고 있으리라", author: "김영랑", work: "모란이 피기까지는", tell: "'있을 테요'처럼 입말 끝맺음은 사람, '있으리라'처럼 문어체로 정리하면 AI인 경우가 많아요" },
];

export const AI_TEST_TOTAL = AI_PAIRS.length;
export const AI_TEST_MIN_PARTICIPANTS = 20;

/** 결과 화면의 인증 칸이 댓글을 다는 글 — AI 덕후방이 열린 뒤 정한다 (빈 값이면 인증 칸을 숨김) */
export const AI_TEST_BRAG_POST_ID = "";

export type AiTier = { emoji: string; name: string; line: string };

export function aiTier(score: number): AiTier {
  if (score >= 10) return { emoji: "🕵️", name: "AI 감별사", line: "진짜 사람 문장을 전부 골라냈어요" };
  if (score >= 8) return { emoji: "🔍", name: "예리한 눈", line: "AI 문장의 '무난함'을 알아보는 눈이에요" };
  if (score >= 6) return { emoji: "🙂", name: "반쯤 속는 사람", line: "그럴듯한 AI 문장에 가끔 속아요" };
  return { emoji: "🤖", name: "AI에 감쪽같이 속음", line: "찍어도 5개 — AI가 사람보다 더 사람 같았어요" };
}

export function aiBragLine(score: number): string | null {
  if (!Number.isInteger(score) || score < 0 || score > AI_TEST_TOTAL) return null;
  const t = aiTier(score);
  return `🤖 AI 판별 테스트 ${score}/${AI_TEST_TOTAL} (${t.emoji} ${t.name}) / 주로 쓰는 AI: `;
}

export type AiStats = { participants: number; topPercent: number | null; average: number | null; byQuestion: number[] };
