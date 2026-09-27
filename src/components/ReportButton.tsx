"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

export function ReportButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);

  async function report() {
    const reason = window.prompt("신고 사유 (광고, 허위정보, 욕설 등). 고유 신고 5건이 쌓이면 자동 블라인드됩니다.");
    if (reason === null) return;
    try {
      const res = await api<{ is_blinded: boolean; alreadyReported: boolean }>(`/api/posts/${postId}/report`, "POST", { reason });
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
