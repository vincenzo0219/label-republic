"use client";

import { useEffect, useState } from "react";
import { getInterests, onInterestsChange, toggleInterest } from "@/lib/interests";

/** 보드 페이지의 "관심 보드" 토글 — 브라우저에만 저장 */
export function InterestToggle({ slug, name }: { slug: string; name: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => setOn(getInterests().includes(slug));
    sync();
    return onInterestsChange(sync);
  }, [slug]);
  if (on === null) return null;
  return (
    <button type="button" className="btn btn-sm" aria-pressed={on} onClick={() => setOn(toggleInterest(slug))} title="관심 보드는 이 브라우저에만 저장됩니다">
      {on ? "★ 관심 보드" : "☆ 관심 보드 추가"}
      <span className="sr-only"> — {name}</span>
    </button>
  );
}
