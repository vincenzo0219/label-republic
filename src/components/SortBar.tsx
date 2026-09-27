import Link from "next/link";
import { SORT_LABEL } from "@/lib/format";
import type { SortKey } from "@/lib/validation";

export function SortBar({ basePath, params, sort, total, capped }: { basePath: string; params?: Record<string, string>; sort: SortKey; total: number; capped?: boolean }) {
  const href = (s: SortKey) => {
    const qs = new URLSearchParams({ ...params, ...(s === "trust" ? {} : { sort: s }) }).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="sortbar">
      <span>{total.toLocaleString("ko-KR")}{capped ? "+" : ""}개의 글</span>
      <nav aria-label="정렬">
        {(Object.keys(SORT_LABEL) as SortKey[]).map((s) => (
          <Link key={s} href={href(s)} aria-current={s === sort ? "true" : undefined} rel="nofollow">
            {SORT_LABEL[s]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
