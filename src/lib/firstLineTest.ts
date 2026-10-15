/**
 * 첫 문장 테스트 (Sprint 65) — 유명한 책 10권의 첫 문장만 보고 제목을 고르는 10문제.
 * 저작권이 끝난 작품만 쓴다 (국내 기준 저작자 사망 후 보호기간이 지난 작품). 외국 작품의 첫 문장은
 * 노방장이 원문에서 직접 옮겼다 — 출판된 번역본의 문장을 가져오지 않는다. 한국 작품은 원문 그대로.
 * 책방(읽는 책 제목을 교환해 보자)에 사람을 데려오는 입구 — 황금귀 테스트와 같은 방식.
 */
export type FirstLineQuestion = {
  line: string;
  answer: string;
  author: string;
  /** 오답 보기 3개 (제목만) */
  others: readonly [string, string, string];
};

/** 쉬운 문제부터 어려운 문제 순서 */
export const FIRST_LINE_QUESTIONS: readonly FirstLineQuestion[] = [
  { line: "여섯 살 때, 나는 원시림에 관한 책에서 멋진 그림 하나를 본 적이 있다.", answer: "어린 왕자", author: "생텍쥐페리", others: ["갈매기의 꿈", "데미안", "이상한 나라의 앨리스"] },
  { line: "어느 날 아침, 뒤숭숭한 꿈에서 깨어난 그레고르 잠자는 침대 속에서 자신이 한 마리 흉측한 벌레로 변해 있는 것을 발견했다.", answer: "변신", author: "프란츠 카프카", others: ["이방인", "성", "페스트"] },
  { line: "행복한 가정은 모두 서로 닮았지만, 불행한 가정은 저마다의 방식으로 불행하다.", answer: "안나 카레니나", author: "레프 톨스토이", others: ["전쟁과 평화", "죄와 벌", "부활"] },
  { line: "넉넉한 재산을 가진 독신 남자라면 틀림없이 아내를 원할 것이라는 점은 누구나 인정하는 진리다.", answer: "오만과 편견", author: "제인 오스틴", others: ["제인 에어", "폭풍의 언덕", "작은 아씨들"] },
  { line: "4월의 맑고 쌀쌀한 날이었고, 시계들이 열세 시를 치고 있었다.", answer: "1984", author: "조지 오웰", others: ["멋진 신세계", "동물농장", "화씨 451"] },
  { line: "'박제가 되어 버린 천재'를 아시오?", answer: "날개", author: "이상", others: ["오감도", "운수 좋은 날", "메밀꽃 필 무렵"] },
  { line: "나를 이슈메일이라고 불러 다오.", answer: "모비 딕", author: "허먼 멜빌", others: ["노인과 바다", "보물섬", "로빈슨 크루소"] },
  { line: "최고의 시절이었고, 최악의 시절이었다.", answer: "두 도시 이야기", author: "찰스 디킨스", others: ["레 미제라블", "위대한 유산", "올리버 트위스트"] },
  { line: "내가 지금보다 어리고 쉽게 상처받던 시절, 아버지가 충고를 하나 해 주셨는데 나는 그 뒤로 그 말을 줄곧 곱씹어 왔다.", answer: "위대한 개츠비", author: "F. 스콧 피츠제럴드", others: ["호밀밭의 파수꾼", "앵무새 죽이기", "분노의 포도"] },
  { line: "오늘도 또 우리 수탉이 막 쫓기었다.", answer: "동백꽃", author: "김유정", others: ["봄봄", "소나기", "운수 좋은 날"] },
];

export const FIRST_LINE_TOTAL = FIRST_LINE_QUESTIONS.length;

export const FIRST_LINE_MIN_PARTICIPANTS = 20;

/** 결과 화면의 인증 칸이 댓글을 다는 글 — 책방의 돈키호테 인증 모음 글 */
export const FIRST_LINE_BRAG_POST_ID = "1389";

export type FirstLineTier = { emoji: string; name: string; line: string };

/** 점수별 등급. 넷 중 하나라 찍어도 2~3개는 맞는다 */
export function firstLineTier(score: number): FirstLineTier {
  if (score >= 10) return { emoji: "📜", name: "첫 문장 마스터", line: "첫 문장만 보고 전부 알아봤어요" };
  if (score >= 8) return { emoji: "🦉", name: "책벌레", line: "고전 첫 문장이 몸에 배어 있어요" };
  if (score >= 5) return { emoji: "📖", name: "꾸준한 독자", line: "유명한 첫 문장은 대부분 알아봐요" };
  if (score >= 3) return { emoji: "☕", name: "가끔 독자", line: "들어 본 문장이 꽤 있었어요" };
  return { emoji: "🌱", name: "이제 시작", line: "모르는 첫 문장이 많을수록 읽을 책도 많아요" };
}

/** 인증 댓글 첫 줄 (QuickBrag 가 뒤에 "요즘 읽는 책"을 붙인다) */
export function firstLineBragLine(score: number): string | null {
  if (!Number.isInteger(score) || score < 0 || score > FIRST_LINE_TOTAL) return null;
  const t = firstLineTier(score);
  return `📜 첫 문장 테스트 ${score}/${FIRST_LINE_TOTAL} (${t.emoji} ${t.name}) / 요즘 읽는 책: `;
}

export type FirstLineStats = {
  participants: number;
  topPercent: number | null;
  average: number | null;
  /** 문제별 정답률 (0~1), 첫 응시 기준 */
  byQuestion: number[];
};
