/**
 * 📚 행사 책 취향 테이블 (11/2 대표님 허락, 💌 미혼남녀 만남 행사 방 놀이 탭). "다음 만남 행사"에서 이야기할 책 취향을 모은다.
 * 정해진 목록에서 최대 3개만 고른다. 자유 입력·닉네임·연락처 없음. 한 브라우저 한 표(다시 고르면 바뀐다).
 * 보여 주는 건 모은 숫자뿐: 응답 5명 이상일 때만 TOP 5 와 대화 주제. 한 사람의 선택은 보이지 않는다.
 */
export const BOOK_TASTE_MAX = 3;
export const BOOK_TASTE_MIN_RESPONSES = 5;

export type BookTaste = { key: string; label: string; topic: string };

export const BOOK_TASTES: readonly BookTaste[] = [
  { key: "novel", label: "📖 한국 소설", topic: "요즘 읽은 소설 속 인물 중 친구 하고 싶은 사람은?" },
  { key: "world", label: "🌍 해외 소설", topic: "가 보고 싶어진 소설 속 도시가 있나요?" },
  { key: "essay", label: "☕ 에세이", topic: "나를 위로해 준 한 문장 이야기" },
  { key: "poem", label: "🌙 시집", topic: "계절마다 떠오르는 시 한 편" },
  { key: "mystery", label: "🔍 추리·스릴러", topic: "범인을 끝까지 몰랐던 책 이야기" },
  { key: "sf", label: "🚀 SF·판타지", topic: "책 속 세계 중 하루 살아 보고 싶은 곳은?" },
  { key: "romance", label: "💗 로맨스", topic: "가장 설렜던 책 속 장면" },
  { key: "history", label: "🏛️ 역사·인문", topic: "시간 여행을 간다면 가 보고 싶은 시대" },
  { key: "science", label: "🔬 과학·교양", topic: "최근에 알게 된 신기한 사실 하나" },
  { key: "self", label: "🌱 자기계발", topic: "책 읽고 바꿔 본 작은 습관" },
  { key: "economy", label: "💼 경제·경영", topic: "일하는 방식이 바뀐 책 한 권" },
  { key: "comic", label: "🎨 만화·웹툰", topic: "인생 만화 한 편과 그 이유" },
  { key: "travel", label: "✈️ 여행", topic: "책 덕분에 떠난 여행, 떠나고 싶은 여행" },
  { key: "cook", label: "🍳 요리·취미", topic: "책 보고 따라 해 본 요리나 취미" },
];

const KEYS = new Set(BOOK_TASTES.map((t) => t.key));

/** 고른 것 정리: 목록에 있는 것만, 겹침 없이, 최대 3개. 하나도 없으면 null */
export function cleanPicks(picks: unknown): string[] | null {
  if (!Array.isArray(picks)) return null;
  const out = [...new Set(picks.filter((p): p is string => typeof p === "string" && KEYS.has(p)))].slice(0, BOOK_TASTE_MAX);
  return out.length ? out : null;
}

export type TasteBoard = { responses: number; top: { key: string; label: string; count: number }[]; topics: string[]; mine: string[] };

/** 센 값 → 보여 줄 판. 응답이 모자라면 TOP·주제는 비운다 */
export function tasteBoard(counts: Record<string, number>, responses: number, mine: string[] = []): TasteBoard {
  if (responses < BOOK_TASTE_MIN_RESPONSES) return { responses, top: [], topics: [], mine };
  const top = BOOK_TASTES.map((t, i) => ({ key: t.key, label: t.label, count: counts[t.key] ?? 0, i }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.i - b.i)
    .slice(0, 5)
    .map(({ key, label, count }) => ({ key, label, count }));
  const topics = top.slice(0, 3).map((t) => BOOK_TASTES.find((b) => b.key === t.key)!.topic);
  return { responses, top, topics, mine };
}
