"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

/** 🚩 신고. path 를 주면 그 주소로 (대강·구인·레슨 글: /api/gigs/:id/report, 10/26) */
export function ReportButton({ postId, blindAt, path, hint = "광고, 허위정보, 욕설 등" }: { postId: string; blindAt: number; path?: string; hint?: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);

  async function report() {
    const reason = window.prompt(`신고 사유 (${hint}). 고유 신고 ${blindAt}건이 쌓이면 자동 블라인드됩니다.`);
    if (reason === null) return;
    try {
      const res = await api<{ is_blinded: boolean; alreadyReported: boolean }>(path ?? `/api/posts/${postId}/report`, "POST", { reason });
      setDone(true);
      if (res.alreadyReported) window.alert("이미 신고한 게시글입니다.");
      if (res.is_blinded) router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  return (
    <button className="btn btn-sm btn-danger" onClick={report} disabled={done}>
      {done ? "신고됨" : "🚩 신고"}
    </button>
  );
}
