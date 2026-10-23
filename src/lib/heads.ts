/**
 * 방 안의 작은 방 (Sprint 86) — 네이버 카페 말머리처럼 제목 앞 "[자랑]" 으로 나눈다. 따로 저장하지 않고 제목으로 거른다.
 * 모든 방: 자랑·행사·혜택. 방마다 더 있을 수 있다 (책 덕후방: 같이 읽기·밑줄, Sprint 96).
 * 혜택(10/23 사용자 미션 "정보·재미·실리를 어떤 커뮤니티보다 잘하자"): 무료 행사·할인·응모·티켓 오픈·굿즈 드롭
 */
export const HEADS = [
  { key: "자랑", label: "📸 자랑" },
  { key: "행사", label: "🎫 행사" },
  { key: "혜택", label: "🎁 혜택" },
] as const;

const BOOK_HEADS = [
  { key: "같이읽기", label: "📖 같이 읽기" },
  { key: "밑줄", label: "🔖 밑줄" },
  { key: "추천", label: "📚 추천" },
] as const;

export const ALL_HEADS = [...BOOK_HEADS, ...HEADS] as const;

export type Head = (typeof ALL_HEADS)[number]["key"];

const BOOK = "읽는-책-제목을-교환해-보자";
export const BOOK_ROOM = BOOK;

/** 방 전용 말머리가 있는 방은 그것만 쓴다 (책 덕후방: 자랑은 밑줄로, 정모는 같이 읽기로 합침 — 10/21 단순화) */
const ROOM_HEADS: Record<string, readonly { key: Head; label: string }[]> = {
  [BOOK]: [...BOOK_HEADS, HEADS[1], HEADS[2]],
};

/** 방 탭 줄 끝에 붙는 다른 화면 링크 (책 덕후방 물어보기는 10/23 📚 추천 탭 안으로 합침) */
export const ROOM_TAB_LINKS: Record<string, { href: string; label: string }[]> = {};

/** 📋 정보 탭을 따로 두지 않는 방 (전체 탭에만 보인다) */
export const NO_INFO_TAB = new Set([BOOK]);


/** 이 방에서 보이는 말머리 (방 전용이 앞) — 글쓰기에서 고르는 목록 */
export const headsFor = (slug: string | undefined): { key: Head; label: string }[] => [...((slug && ROOM_HEADS[slug]) || HEADS)];

/** 탭 하나에 다른 말머리 글도 함께 보이게 (10/23 사용자 "핫딜·할인은 모든 행사방에 넣어") */
const TAB_INCLUDES: Partial<Record<Head, Head[]>> = { 행사: ["혜택"] };
const TAB_LABELS: Partial<Record<Head, string>> = { 행사: "🎫 행사·할인" };

/** 방 탭 줄에 보이는 말머리 — 다른 탭에 합쳐진 말머리(혜택)는 따로 탭을 두지 않는다 */
export const tabHeadsFor = (slug: string | undefined): { key: Head; label: string }[] => {
  const merged = new Set(Object.values(TAB_INCLUDES).flat());
  return headsFor(slug).filter((h) => !merged.has(h.key)).map((h) => ({ ...h, label: TAB_LABELS[h.key] ?? h.label }));
};

/** 이 탭에 보이는 말머리들 (자기 자신 + 합쳐진 것) */
export const tabMembers = (h: Head): Head[] => [h, ...(TAB_INCLUDES[h] ?? [])];

/** 말머리를 고르면 본문 칸 예시도 바꾼다. 자랑은 물건보다 경험 쪽으로 (물건 자랑도 환영) */
export const HEAD_HINTS: Partial<Record<Head, string>> = {
  자랑: "물건도 경험도 다 좋아요.\n예) 오늘 다녀온 직관 · 우리 개 산책 코스 · 이번 달 읽은 책 · 처음 산 LP",
  행사: "언제 · 어디서 · 무엇을, 그리고 공식 안내 링크를 남겨 주세요.",
  혜택: "무엇을 · 언제까지 · 어떻게 받는지, 그리고 공식 안내 링크를 남겨 주세요.",
  같이읽기: "같이 읽을 책 · 어디까지 읽었는지 · 모임 날짜",
  밑줄: "좋았던 문장 한 줄과 책 제목 (사진도 좋아요)",
  추천: "이런 상황엔 이 책 · 같은 주제 다른 관점 두 권 · 신간 · 명저 (상황별로 물어보기는 이 탭 아래에서)",
};

export const parseHead = (v: string | undefined): Head | undefined => ALL_HEADS.find((h) => h.key === v)?.key;

export const HEAD_PREFIX = /^\[([^\]]{2,4})\]\s*/;

export const headOf = (title: string): Head | undefined => parseHead(HEAD_PREFIX.exec(title)?.[1]);

export const headLabel = (h: Head) => ALL_HEADS.find((x) => x.key === h)!.label;

/** 제목의 말머리를 바꾼다 (같은 걸 다시 누르면 뗀다) */
export function withHead(title: string, head: Head): string {
  const cur = headOf(title);
  const bare = cur ? title.slice(cur.length + 2).trimStart() : title;
  return cur === head ? bare : `[${head}] ${bare}`;
}
