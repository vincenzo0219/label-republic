"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

/**
 * 🚩 신고. 기본은 글 신고(/api/posts/:id/report). path 를 주면 그 주소로 {reason, ...extra} 를 보낸다
 * (🙋 같이 가요 모집·조 채팅, 10/26). what: 안내 문구의 대상 이름.
 */
export function ReportButton({ postId, blindAt, path, extra, label, what = "게시글", onHidden }: {
  postId?: string;
  blindAt: number;
  path?: string;
  extra?: Record<string, unknown>;
  label?: string;
  what?: string;
  onHidden?: () => void;
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);

  async function report() {
    const reason = window.prompt(`신고 사유 (광고, 허위정보, 욕설 등). 고유 신고 ${blindAt}건이 쌓이면 자동으로 가려집니다.`);
    if (reason === null) return;
    try {
      const res = await api<{ is_blinded?: boolean; alreadyReported?: boolean; hidden?: boolean; already?: boolean }>(
        path ?? `/api/posts/${postId}/report`,
        "POST",
        { ...extra, reason },
      );
      setDone(true);
      if (res.alreadyReported || res.already) window.alert(`이미 신고한 ${what}입니다.`);
      if (res.is_blinded || res.hidden) {
        if (onHidden) onHidden();
        else router.refresh();
      }
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  return (
    <button type="button" className="btn btn-sm btn-danger" onClick={report} disabled={done}>
      {done ? "신고됨" : (label ?? "🚩 신고")}
    </button>
  );
}
