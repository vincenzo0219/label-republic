/**
 * 📖 책 카드 (Sprint 62) — 책마다 한 페이지에 독자 기록이 쌓인다.
 * 완독률 = 완독 ÷ (완독 + 중도 포기). 읽는 중인 사람은 아직 결론이 없으니 빼고 센다.
 */
export const BOOK_STATUSES = ["reading", "done", "dropped"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const BOOK_STATUS_LABEL: Record<BookStatus, { emoji: string; label: string }> = {
  reading: { emoji: "📖", label: "읽는 중" },
  done: { emoji: "✅", label: "완독" },
  dropped: { emoji: "🏳️", label: "중도 포기" },
};

/** 완독·중도 포기가 합쳐 이만큼은 모여야 완독률을 보여 준다 (한두 명으로 %를 내면 오해를 준다) */
export const BOOK_MIN_FOR_RATE = 3;

/** 책방 — 책 카드를 안내하는 방 (사용자가 연 첫 방) */
export const BOOK_ROOM_SLUG = "읽는-책-제목을-교환해-보자";

/** 띄어쓰기·기호·대소문자를 무시한 비교용 문자열 */
export function normText(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function bookKey(title: string, author: string): string {
  return `${normText(title)}|${normText(author)}`;
}

export function completionRate(done: number, dropped: number): number | null {
  const n = done + dropped;
  return n >= BOOK_MIN_FOR_RATE ? Math.round((done / n) * 100) : null;
}

export type BookRead = {
  id: string;
  nickname: string;
  status: BookStatus;
  progress: number;
  line: string;
  next_title: string;
  /** 어느 출판사(번역)로 읽었는지 (Sprint 63) */
  edition: string;
  hidden: boolean;
  updated_at: string;
  mine: boolean;
};

export type BookSummary = {
  id: string;
  title: string;
  author: string;
  reading: number;
  done: number;
  dropped: number;
  last_read_at: string;
};

export type BookDetail = BookSummary & {
  /** 완독률(%) — 기록이 적으면 null */
  rate: number | null;
  /** 중도 포기한 사람들이 평균 몇 %에서 멈췄는지 */
  dropAt: number | null;
  /** 이 책 다음에 읽은 책 (많이 나온 순) — 노방장에 카드가 있으면 id */
  nextBooks: { title: string; count: number; bookId: string | null }[];
  reads: BookRead[];
  /** 출판사(번역)별 기록 — 같은 표기끼리 묶음 (Sprint 63) */
  editions: { edition: string; total: number; done: number; dropped: number; rate: number | null }[];
  /** 이 책이 추천된 상황 (Sprint 63) */
  askedIn: { id: string; situation: string; count: number }[];
};

/** 상황별 추천 (Sprint 63) */
export type BookAskSummary = { id: string; situation: string; detail: string; nickname: string; books: number; answers: number; top: string[]; last_answer_at: string };

export type BookAskDetail = BookAskSummary & {
  hidden: boolean;
  /** 추천된 책 — 추천한 사람 수 순 */
  picks: { bookId: string; title: string; author: string; count: number; mine: boolean; reasons: { nickname: string; reason: string }[] }[];
};
