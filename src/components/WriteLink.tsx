"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/** 머리글 "글쓰기" — 보고 있는 방·탭(후기·자랑… / 정보·정모)으로 바로 쓴다 */
export function WriteLink() {
  const path = usePathname();
  const sp = useSearchParams();
  const room = /^\/c\/([^/]+)/.exec(path)?.[1];
  const qs = new URLSearchParams();
  if (room) {
    qs.set("category", decodeURIComponent(room));
    const head = sp.get("head");
    const type = sp.get("type");
    if (head) qs.set("head", head);
    else if (type === "info" || type === "meetup") qs.set("type", type);
  }
  const q = qs.toString();
  return (
    <Link href={q ? `/write?${q}` : "/write"} className="btn btn-primary">
      글쓰기
    </Link>
  );
}
