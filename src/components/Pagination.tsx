import Link from "next/link";

/** 이보다 깊은 페이지는 조회하지 않는다 (src/lib/repo/posts.ts MAX_PAGE 와 같게) */
const MAX_PAGE = 500;

export function Pagination({ basePath, params, page, pageSize, total, capped }: { basePath: string; params?: Record<string, string>; page: number; pageSize: number; total: number; capped?: boolean }) {
  // capped: 전체 개수를 모르는 목록(검색) — 다음 페이지가 있다는 것만 안다
  const last = Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / pageSize)));
  const hasNext = capped ? page < MAX_PAGE : page < last;
  if (last <= 1 && !hasNext && page <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams({ ...params, ...(p > 1 ? { page: String(p) } : {}) }).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav className="pagination" aria-label="페이지">
      {page > 1 && <Link className="btn btn-sm" href={href(page - 1)} rel="prev">← 이전</Link>}
      <span className="hint" style={{ alignSelf: "center" }}>{capped ? `${page}쪽` : `${page} / ${last}${last * pageSize < total ? "+" : ""}`}</span>
      {hasNext && <Link className="btn btn-sm" href={href(page + 1)} rel="next">다음 →</Link>}
    </nav>
  );
}
