import Link from "next/link";

export function Pagination({ basePath, params, page, pageSize, total }: { basePath: string; params?: Record<string, string>; page: number; pageSize: number; total: number }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams({ ...params, ...(p > 1 ? { page: String(p) } : {}) }).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav className="pagination" aria-label="페이지">
      {page > 1 && <Link className="btn btn-sm" href={href(page - 1)} rel="prev">← 이전</Link>}
      <span className="hint" style={{ alignSelf: "center" }}>{page} / {last}</span>
      {page < last && <Link className="btn btn-sm" href={href(page + 1)} rel="next">다음 →</Link>}
    </nav>
  );
}
