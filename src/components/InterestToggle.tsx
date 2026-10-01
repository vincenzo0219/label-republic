"use client";

import { useEffect, useState } from "react";
import { getInterests, onInterestsChange, toggleInterest } from "@/lib/interests";

/** 방 페이지의 "관심 방" 토글 — 브라우저에만 저장 */
export function InterestToggle({ slug, name }: { slug: string; name: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => setOn(getInterests().includes(slug));
    sync();
    return onInterestsChange(sync);
  }, [slug]);
  // 저장된 값을 읽기 전에도 같은 크기의 버튼을 그려 둔다 (나중에 끼어들며 화면이 밀리지 않게)
  return (
    <button type="button" className="btn btn-sm" aria-pressed={!!on} disabled={on === null} onClick={() => setOn(toggleInterest(slug))} title="관심 방은 이 브라우저에만 저장됩니다">
      {on ? "★ 관심 방" : "☆ 관심 방 추가"}
      <span className="sr-only"> — {name}</span>
    </button>
  );
}
