"use client";

import { useEffect, useState } from "react";
import { onInterestsChange } from "@/lib/interests";
import { getWatchedPosts, getWatchedProducts, toggleWatchPost, toggleWatchProduct } from "@/lib/watchlist";

/**
 * 관심 제품 / 글 알림 토글 — 브라우저에만 저장. 소식은 📬 내 리포트(와 켠 경우 푸시 알림)로 모인다.
 */
export function WatchToggle({ kind, id, name }: { kind: "product" | "post"; id: string; name: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => setOn((kind === "product" ? getWatchedProducts() : getWatchedPosts()).includes(id));
    sync();
    return onInterestsChange(sync);
  }, [kind, id]);
  // 저장된 값을 읽기 전에도 같은 크기의 버튼을 그려 둔다 (나중에 끼어들며 화면이 밀리지 않게)
  const label = kind === "product" ? (on ? "★ 관심 제품" : "☆ 관심 제품") : on ? "🔔 소식 받는 중" : "🔕 이 글 소식 받기";
  return (
    <button
      type="button"
      className="btn btn-sm"
      aria-pressed={!!on}
      disabled={on === null}
      onClick={() => setOn(kind === "product" ? toggleWatchProduct(id) : toggleWatchPost(id))}
      title={kind === "product" ? "새 글·동의된 정정 제안을 📬 내 리포트로 모아 드려요 (이 브라우저에만 저장)" : "새 댓글·정정 제안·수정을 📬 내 리포트로 알려 드려요 (이 브라우저에만 저장)"}
    >
      {label}
      <span className="sr-only"> — {name}</span>
    </button>
  );
}
