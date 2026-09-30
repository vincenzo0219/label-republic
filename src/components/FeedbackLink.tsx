"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 푸터의 "고쳐 주세요" — 보던 화면 경로를 함께 넘긴다 (Sprint 36) */
export function FeedbackLink() {
  const pathname = usePathname();
  const from = pathname && !pathname.startsWith("/feedback") ? `?from=${encodeURIComponent(pathname)}` : "";
  return <Link href={`/feedback${from}`}>🛠 고쳐 주세요 · 제안하기</Link>;
}
