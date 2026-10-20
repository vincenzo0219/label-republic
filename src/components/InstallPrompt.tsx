"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Mode = "hidden" | "installed" | "prompt" | "ios" | "manual";

/** 홈 화면에 추가 안내 (Sprint 19). 이미 앱으로 열었으면 오프라인 저장 안내만 보여준다 */
export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return setMode("installed");
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setMode(ios ? "ios" : "manual");
    const onPrompt = (e: Event) => {
      e.preventDefault(); // 브라우저 기본 배너 대신 이 버튼으로
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("prompt");
    };
    const onInstalled = () => {
      setDeferred(null);
      setMode("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setMode(outcome === "accepted" ? "installed" : "manual");
  }

  // 짧게: 설치 버튼 하나, 아이폰은 한 줄. 이미 앱이거나 안내할 버튼이 없으면 안 보인다
  if (mode === "prompt")
    return (
      <section className="push-settings" aria-label="홈 화면에 추가">
        <button type="button" className="btn btn-sm" onClick={install}>📱 홈 화면에 추가</button>
      </section>
    );
  if (mode === "ios")
    return (
      <section className="push-settings" aria-label="홈 화면에 추가">
        <p className="hint" style={{ margin: 0 }}>📱 Safari <b>공유</b> → <b>홈 화면에 추가</b></p>
      </section>
    );
  return null;
}
