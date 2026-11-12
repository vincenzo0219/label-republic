"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type InstallMode = "hidden" | "installed" | "prompt" | "ios" | "manual";

/**
 * 홈 화면에 추가 상태 (마이페이지 안내·홈 버튼이 같이 쓴다).
 * hidden: 아직 모름(서버 렌더) · installed: 앱으로 열었거나 방금 설치 · prompt: 브라우저 설치 창을 띄울 수 있음
 * ios: 아이폰·아이패드(설치 창 없음, 공유 메뉴로) · manual: 그 밖의 브라우저(메뉴로)
 */
export function useInstallPrompt() {
  const [mode, setMode] = useState<InstallMode>("hidden");
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

  return { mode, install };
}

/** 홈 화면에 추가 안내 (Sprint 19). 이미 앱으로 열었으면 오프라인 저장 안내만 보여준다 */
export function InstallPrompt() {
  const { mode, install } = useInstallPrompt();

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

/**
 * 홈 맨 위 작은 "📲 앱 설치" 버튼 (11/12 대표님 "홈화면에 설치 버튼 필요").
 * 설치 창이 있으면 바로 띄우고, 없으면(아이폰·그 밖의 브라우저) 누를 때 한 줄 안내를 편다. 앱으로 열었으면 안 보인다
 */
export function HomeInstallButton() {
  const { mode, install } = useInstallPrompt();
  const [guide, setGuide] = useState(false);
  if (mode === "hidden" || mode === "installed") return null;
  const click = () => (mode === "prompt" ? void install() : setGuide((g) => !g));
  return (
    <div className="home-install">
      <button type="button" className="btn btn-sm" onClick={click} aria-expanded={mode === "prompt" ? undefined : guide}>
        📲 앱 설치
      </button>
      {guide && mode !== "prompt" && (
        <p className="hint" role="status">
          {mode === "ios" ? (
            <>
              Safari 아래 <b>공유 버튼</b> → <b>홈 화면에 추가</b>
            </>
          ) : (
            <>
              브라우저 메뉴(⋮) → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>
            </>
          )}
        </p>
      )}
    </div>
  );
}
