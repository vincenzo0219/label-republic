import Link from "next/link";
import type { Category } from "@/lib/types";
import { activeRoomsFirst } from "@/lib/repo/categories";
import { NewCountsLoader, TabNewCount } from "./NewMarks";

/**
 * quiet: 사람 글·댓글이 한동안 없는 방 — 뒤로 보내고 한 단계 약하게 (론칭 후: 사람이 모인 방이 먼저 보이게).
 * 지금 보고 있는 방은 약하게 하지 않는다.
 */
export function CategoryTabs({ categories, active, quiet = [] }: { categories: Category[]; active?: string; quiet?: string[] }) {
  const q = new Set(quiet);
  return (
    <nav className="tabs" aria-label="카테고리">
      <NewCountsLoader active={active} />
      <Link href="/" className="tab" aria-current={!active ? "page" : undefined}>
        전체
      </Link>
      {activeRoomsFirst(categories, q).map((c) => {
        const dim = q.has(c.slug) && active !== c.slug;
        return (
          <Link key={c.slug} href={`/c/${encodeURIComponent(c.slug)}`} className={dim ? "tab tab-quiet" : "tab"} aria-current={active === c.slug ? "page" : undefined}>
            {c.name}
            {dim && <span className="sr-only"> (아직 조용한 방)</span>}
            {active !== c.slug && <TabNewCount slug={c.slug} />}
          </Link>
        );
      })}
      <Link href="/boards" className="tab tab-add">
        ＋ 방 만들기
      </Link>
    </nav>
  );
}
