"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { cheeredPosts, reactionCountText, reactionLabel, rememberCheer } from "@/lib/fanDays";
import type { CardKind } from "@/lib/types";

/**
 * 🎉 축하해요 · 💪 응원해요 (10/26) — 기념일·응원 카드의 버튼 하나. 닉네임·비밀번호·글 없이 한 번 누르면 끝 (다시 눌러도 그대로).
 * variant: "page" 글 화면 · "card" 목록 카드 아래 · "strip" 오늘 축하할 덕후 줄 안
 */
export function CheerButton({ postId, initial, kind, variant = "page" }: { postId: string; initial: number; kind: CardKind; variant?: "page" | "card" | "strip" }) {
  const [count, setCount] = useState(initial);
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setMine(cheeredPosts().includes(postId));
  }, [postId]);

  const tap = async () => {
    if (mine || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ cheers: number }>(`/api/cards/${postId}/cheer`, "POST", {});
      setCount(r.cheers);
      setMine(true);
      rememberCheer(postId);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`cheer cheer-${variant}`}>
      <button type="button" className={`btn cheer-btn${mine ? " on" : ""}`} onClick={tap} disabled={busy} aria-pressed={mine}>
        {reactionLabel(kind, mine)}
      </button>
      <span className="cheer-count" aria-live="polite">
        {variant === "strip" ? (count > 0 ? count.toLocaleString("ko-KR") : "") : reactionCountText(kind, count)}
      </span>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
