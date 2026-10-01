import Link from "next/link";
import type { Category } from "@/lib/types";
import { NewCountsLoader, TabNewCount } from "./NewMarks";

export function CategoryTabs({ categories, active }: { categories: Category[]; active?: string }) {
  return (
    <nav className="tabs" aria-label="카테고리">
      <NewCountsLoader active={active} />
      <Link href="/" className="tab" aria-current={!active ? "page" : undefined}>
        전체
      </Link>
      {categories.map((c) => (
        <Link key={c.slug} href={`/c/${encodeURIComponent(c.slug)}`} className="tab" aria-current={active === c.slug ? "page" : undefined}>
          {c.name}
          {active !== c.slug && <TabNewCount slug={c.slug} />}
        </Link>
      ))}
      <Link href="/boards" className="tab tab-add">
        ＋ 방 만들기
      </Link>
    </nav>
  );
}
