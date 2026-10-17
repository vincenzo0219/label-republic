"use client";

import { useEffect, useState } from "react";

/**
 * 🥊 친구 대결 (Sprint 75). 결과 화면에서 "친구에게 대결 신청" 링크(?vs=점수&n=닉네임)를 보내면,
 * 친구는 시작 화면에서 상대 점수를 보고, 끝나면 둘의 결과를 나란히 본다. 서버에 저장하지 않는다.
 */
export type Vs = { score: number; name: string };

const cleanName = (s: string | null) => (s ?? "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 12);

export function useVs(max: number): Vs | null {
  const [vs, setVs] = useState<Vs | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const score = Number(q.get("vs"));
    if (q.has("vs") && Number.isFinite(score) && score >= 0 && score <= max) setVs({ score: Math.round(score), name: cleanName(q.get("n")) || "친구" });
  }, [max]);
  return vs;
}

export function VsIntro({ vs, unit }: { vs: Vs | null; unit: string }) {
  if (!vs) return null;
  return (
    <p className="vs-banner">
      🥊 <b>{vs.name}</b>님 기록 <b>{vs.score}{unit}</b> — 이길 수 있어요?
    </p>
  );
}

/** 결과 화면: 대결 결과(있으면) + 대결 신청 버튼 */
export function Versus({ vs, mine, unit, path, label }: { vs: Vs | null; mine: number; unit: string; path: string; label: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const send = async () => {
    let n = "";
    try {
      n = cleanName(window.localStorage.getItem("lr:nickname"));
    } catch {}
    const url = `https://nobangjang.com${path}?vs=${mine}${n ? `&n=${encodeURIComponent(n)}` : ""}&from=vs`;
    const text = `${label} 나는 ${mine}${unit}. 이길 수 있어? 🥊`;
    try {
      if (navigator.share) return await navigator.share({ text, url });
      await navigator.clipboard.writeText(`${text} ${url}`);
      setMsg("링크를 복사했어요. 친구에게 보내 주세요.");
    } catch {}
  };
  const result = vs ? (mine > vs.score ? "🎉 이겼어요!" : mine < vs.score ? "😅 졌어요" : "🤝 비겼어요") : null;
  return (
    <div className="vs-box">
      {vs && (
        <p className="vs-result">
          🥊 {vs.name} <b>{vs.score}{unit}</b> vs 나 <b>{mine}{unit}</b> — {result}
        </p>
      )}
      <button type="button" className="btn" onClick={send}>
        🥊 친구에게 대결 신청
      </button>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
