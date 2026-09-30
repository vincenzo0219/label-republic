"use client";

import { useState } from "react";

/**
 * 카드뷰 공유: 모바일은 Web Share API로 3줄 요약 이미지를 바로 보내고,
 * 지원하지 않는 환경은 링크 복사 / X 공유 / 이미지 저장으로 대체한다.
 */
export function ShareButton({ postId, title }: { postId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const url = typeof window === "undefined" ? `/posts/${postId}` : `${window.location.origin}/posts/${postId}`;
  const imageUrl = `/posts/${postId}/card?format=square`;

  async function shareImage() {
    setMsg(null);
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error("이미지를 만들 수 없는 글입니다.");
      const file = new File([await res.blob()], `labelrepublic-${postId}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${title}\n${url}` });
        return;
      }
      // 파일 공유 미지원 → 이미지 저장
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg("이미지를 저장했어요.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg((e as Error).message);
    }
  }

  async function shareLink() {
    setMsg(null);
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setMsg("링크를 복사했어요.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("공유에 실패했어요.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMsg("링크를 복사했어요.");
    } catch {
      setMsg("복사에 실패했어요.");
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button className="btn btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        📤 공유
      </button>
      {open && (
        <div className="share-menu" role="menu">
          <button role="menuitem" onClick={shareImage}>🖼 요약 카드 이미지로 공유</button>
          <button role="menuitem" onClick={shareLink}>🔗 링크 공유</button>
          <button role="menuitem" onClick={copyLink}>📋 링크 복사</button>
          <a role="menuitem" href={`https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
            𝕏 X에 공유
          </a>
          <a role="menuitem" href={imageUrl} download={`labelrepublic-${postId}.png`}>⬇ 카드 이미지 저장</a>
          {msg && <p className="hint" style={{ margin: "6px 10px" }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
