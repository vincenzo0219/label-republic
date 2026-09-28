"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/components/ErrorReporter";

/** 페이지 렌더링 중 예외 — 레이아웃(헤더·푸터)은 유지하고 본문만 대체한다 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // 서버 렌더링 오류는 서버가 이미 남겼으므로(digest 있음) 브라우저에서 난 오류만 보낸다
    if (!error.digest) reportClientError(`렌더링 오류: ${error.message}`, (error.stack ?? "").split("\n").find((l) => l.includes("/_next/"))?.trim() ?? "/_next/(unknown)");
  }, [error]);
  return (
    <div className="empty" role="alert">
      <p>일시적인 오류로 페이지를 보여드리지 못했어요.</p>
      <p className="hint">잠시 후 다시 시도해 주세요.{error.digest ? ` (오류 코드: ${error.digest})` : ""}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
        <button className="btn btn-primary" onClick={reset}>
          다시 시도
        </button>
        <Link className="btn" href="/">
          홈으로
        </Link>
      </div>
    </div>
  );
}
