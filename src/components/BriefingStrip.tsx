import Link from "next/link";
import type { Briefing } from "@/lib/repo/briefings";

/** 📰 오늘 브리핑: 방 맨 위 한 줄 (장 전 · 속보 · 마감 · 저녁). 오늘 것은 진하게, 지난 것은 날짜 그대로 */
export function BriefingStrip({ items }: { items: Briefing[] }) {
  if (!items.length) return null;
  return (
    <nav className="briefing-strip" aria-label="오늘 브리핑">
      <strong>📰 브리핑</strong>
      {items.map((b) => (
        <Link key={b.key} href={`/posts/${b.postId}`} className={b.today ? "on" : undefined} title={b.title}>
          {b.label}
        </Link>
      ))}
    </nav>
  );
}
