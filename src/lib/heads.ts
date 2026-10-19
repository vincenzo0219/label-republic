/**
 * 방 안의 작은 방 (Sprint 86) — 네이버 카페 말머리처럼 제목 앞 "[질문]" 으로 나눈다. 따로 저장하지 않고 제목으로 거른다.
 */
export const HEADS = [
  { key: "질문", label: "🙋 질문" },
  { key: "자랑", label: "📸 자랑" },
  { key: "후기", label: "✍️ 후기" },
  { key: "꿀팁", label: "💡 꿀팁" },
  { key: "행사", label: "🎫 행사" },
] as const;

export type Head = (typeof HEADS)[number]["key"];

/** 말머리를 고르면 본문 칸 예시도 바꾼다. 자랑은 물건보다 경험 쪽으로 (물건 자랑도 환영) */
export const HEAD_HINTS: Partial<Record<Head, string>> = {
  자랑: "물건도 경험도 다 좋아요.\n예) 오늘 다녀온 직관 · 우리 개 산책 코스 · 이번 달 읽은 책 · 처음 산 LP",
  행사: "언제 · 어디서 · 무엇을, 그리고 공식 안내 링크를 남겨 주세요.",
};

export const parseHead = (v: string | undefined): Head | undefined => HEADS.find((h) => h.key === v)?.key;

export const headOf = (title: string): Head | undefined => parseHead(/^\[([^\]]{2})\]/.exec(title)?.[1]);

/** 제목의 말머리를 바꾼다 (같은 걸 다시 누르면 뗀다) */
export function withHead(title: string, head: Head): string {
  const cur = headOf(title);
  const bare = cur ? title.slice(cur.length + 2).trimStart() : title;
  return cur === head ? bare : `[${head}] ${bare}`;
}
