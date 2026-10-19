/**
 * 방 안의 작은 방 (Sprint 86) — 네이버 카페 말머리처럼 제목 앞 "[질문]" 으로 나눈다. 따로 저장하지 않고 제목으로 거른다.
 */
export const HEADS = [
  { key: "질문", label: "🙋 질문" },
  { key: "자랑", label: "📸 자랑" },
  { key: "후기", label: "✍️ 후기" },
  { key: "꿀팁", label: "💡 꿀팁" },
] as const;

export type Head = (typeof HEADS)[number]["key"];

export const parseHead = (v: string | undefined): Head | undefined => HEADS.find((h) => h.key === v)?.key;

export const headOf = (title: string): Head | undefined => parseHead(/^\[([^\]]{2})\]/.exec(title)?.[1]);

/** 제목의 말머리를 바꾼다 (같은 걸 다시 누르면 뗀다) */
export function withHead(title: string, head: Head): string {
  const cur = headOf(title);
  const bare = cur ? title.slice(cur.length + 2).trimStart() : title;
  return cur === head ? bare : `[${head}] ${bare}`;
}
