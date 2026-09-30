"use client";

import Link from "next/link";
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

  if (mode === "hidden") return null;
  return (
    <section className="push-settings" aria-labelledby="install-h">
      <h2 id="install-h" className="section-title">📱 홈 화면에 추가</h2>
      {mode === "installed" && (
        <p className="hint" style={{ marginTop: 0 }}>
          앱으로 쓰고 있어요. 글에서 📥 <b>오프라인 저장</b>을 누르면 매장처럼 연결이 약한 곳에서도 <Link href="/offline">저장한 글</Link>을 볼 수 있어요.
        </p>
      )}
      {mode === "prompt" && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>앱처럼 바로 열고, 저장한 글은 연결 없이도 볼 수 있어요.</p>
          <button type="button" className="btn btn-sm" onClick={install}>홈 화면에 추가</button>
        </>
      )}
      {mode === "ios" && (
        <p className="hint" style={{ marginTop: 0 }}>
          Safari 아래쪽 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>를 누르세요. 홈 화면에서 열면 푸시 알림도 받을 수 있어요.
        </p>
      )}
      {mode === "manual" && (
        <p className="hint" style={{ marginTop: 0 }}>
          브라우저 메뉴의 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>로 앱처럼 쓸 수 있어요. 저장한 글은 <Link href="/offline">여기</Link>에서 봐요.
        </p>
      )}
    </section>
  );
}
