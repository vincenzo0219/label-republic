"use client";

import { useEffect } from "react";

let sent = 0;

/** 브라우저 오류를 /api/errors 로 보낸다 (페이지당 5건까지) */
export function reportClientError(message: string, source = "", digest = "") {
  if (sent >= 5) return;
  sent++;
  try {
    const body = JSON.stringify({ message: message.slice(0, 500), source: source.slice(0, 300), path: location.pathname, digest: digest.slice(0, 40) });
    void fetch("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // 스크립트 위치가 없는 오류(다른 출처 스크립트의 "Script error.")는 원인을 알 수 없어 보내지 않는다
      if (!e.filename) return;
      reportClientError(e.message, `${e.filename}:${e.lineno}:${e.colno}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const stackLine = r instanceof Error ? (r.stack ?? "").split("\n").find((l) => l.includes("/_next/")) ?? "" : "";
      const src = /(https?:\/\/[^\s)]+|\/_next\/[^\s)]+)/.exec(stackLine)?.[1] ?? "";
      if (!src) return;
      reportClientError(r instanceof Error ? r.message : String(r), src);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
