"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KIDS_ROOM, KIDS_TAB, areaShort, isThisWeekFree, type KidsProgram } from "@/lib/kidsPrograms";
import { getArea, loadPrograms } from "@/lib/kidsClient";
import { KidsCard } from "./KidsCard";

const TAB = `/c/${encodeURIComponent(KIDS_ROOM)}?tab=${KIDS_TAB}`;

/** 육아방 전체 탭 맨 위 한 줄: 📍 {구} · 이번 주 무료 체험 N개 → + 작은 카드 2개. 지역이 없으면 📍 동네 고르기. 실패하면 안 보인다 */
export function KidsTopLine() {
  const [area, setArea] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<KidsProgram[] | null>(null);
  useEffect(() => setArea(getArea()), []);
  useEffect(() => {
    if (!area) return;
    loadPrograms({ area, free: "1", limit: "30" }).then(setItems).catch(() => setItems(null));
  }, [area]);

  if (area === undefined) return null;
  if (!area)
    return (
      <Link href={TAB} className="kids-line">📍 동네 고르기</Link>
    );
  if (!items) return null;
  const week = items.filter((p) => isThisWeekFree(p));
  const show = (week.length ? week : items).slice(0, 2);
  return (
    <div className="kids-top">
      <Link href={TAB} className="kids-line">📍 {areaShort(area)} · 이번 주 무료 체험 {week.length}개 →</Link>
      {show.length > 0 && (
        <div className="kids-grid mini">
          {show.map((p) => <KidsCard key={p.id} program={p} mini />)}
        </div>
      )}
    </div>
  );
}
