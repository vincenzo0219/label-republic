/**
 * 📬 새 소식 배지(홈·헤더)와 내 리포트(/me)가 같은 요청을 만들게 하는 한 곳 (10/25).
 * 둘이 따로 만들던 때는 배지는 "관심 방 ∩ 내 방", 리포트는 "관심 방"을 보내서 배지가 센 글이 리포트에 없었다.
 * 순수 함수라 서버·테스트에서도 import 할 수 있다 (브라우저 값은 호출하는 쪽이 읽어 넘긴다).
 */
/** 리포트 한 번에 보는 방 수 (서버도 같은 값으로 자른다) */
export const MAX_REPORT_BOARDS = 10;

/** new: 지난 확인 이후 새 글 (이미 본 방 시각·열어 본 글 제외) · week: 최근 7일 전체 (본 것과 상관없이) */
export type ReportMode = "new" | "week";

export type ReportInput = {
  /** 내 방 (nb:myRooms) */
  mine: string[];
  /** ☆ 관심 방 (lr:interests) */
  interests: string[];
  products: string[];
  posts: string[];
  comments: string[];
  /** lr:reportSeenAt */
  since: string | null;
  /** "slug:ms,..." (seenParam) */
  seen: string;
  /** 열어 본 글 번호 (lr:readPosts) */
  read: string[];
};

/** 리포트의 "관심 방": 내 방이 있으면 내 방, 없으면 예전 ☆ 관심 방 */
export function reportBoards(mine: string[], interests: string[]): string[] {
  return [...new Set(mine.length ? mine : interests)].slice(0, MAX_REPORT_BOARDS);
}

export function hasReportItems(i: Pick<ReportInput, "mine" | "interests" | "products" | "posts" | "comments">): boolean {
  return reportBoards(i.mine, i.interests).length + i.products.length + i.posts.length + i.comments.length > 0;
}

export function reportQuery(i: ReportInput, mode: ReportMode, count = false): URLSearchParams {
  const boards = reportBoards(i.mine, i.interests);
  const fresh = mode === "new";
  return new URLSearchParams({
    ...(count ? { count: "1" } : {}),
    ...(boards.length ? { boards: boards.join(",") } : {}),
    ...(i.products.length ? { products: i.products.join(",") } : {}),
    ...(i.posts.length ? { posts: i.posts.join(",") } : {}),
    ...(i.comments.length ? { comments: i.comments.join(",") } : {}),
    // 최근 7일은 기준 시각·방 본 시각·열어 본 글을 보내지 않는다 (서버 기본이 최근 7일)
    ...(fresh && i.since ? { since: i.since } : {}),
    ...(fresh && i.seen ? { seen: i.seen } : {}),
    ...(fresh && i.read.length ? { read: i.read.join(",") } : {}),
  });
}
