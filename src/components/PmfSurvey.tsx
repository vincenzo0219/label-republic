"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

const OPTIONS = [
  { v: 1, label: "😢 매우 아쉬울 것 같아요" },
  { v: 2, label: "🙂 조금 아쉬울 것 같아요" },
  { v: 3, label: "😐 아쉽지 않아요" },
] as const;

/**
 * "노방장이 없어진다면?" (Sprint 40, 숀 엘리스 테스트). 서로 다른 날 3일 이상 온 방문자에게 홈에서 한 번만.
 * 닫으면 90일, 답하면 1년 동안 다시 묻지 않는다. 응답은 익명 — 글·댓글과 연결하지 않는다.
 */
export function PmfSurvey({ cookieName }: { cookieName: string }) {
  const [open, setOpen] = useState(true);
  const [answer, setAnswer] = useState<1 | 2 | 3 | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"ask" | "sending" | "done">("ask");
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const dismiss = () => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${cookieName}=0; Max-Age=${60 * 60 * 24 * 90}; Path=/; SameSite=Lax${secure}`;
    setOpen(false);
  };
  const send = async () => {
    if (!answer) return;
    setState("sending");
    setError(null);
    try {
      await api("/api/survey", "POST", { answer, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("ask");
    }
  };

  if (state === "done") {
    return (
      <section className="pmf-card" role="status">
        <h2>고마워요! 🙏</h2>
        <p className="hint" style={{ margin: 0 }}>
          답해 주신 내용은 노방장을 어떻게 고칠지 정하는 데 씁니다.
        </p>
      </section>
    );
  }
  return (
    <section className="pmf-card" aria-labelledby="pmf-h">
      <h2 id="pmf-h">한 가지만 여쭤볼게요 — 노방장이 내일 없어진다면?</h2>
      <p className="hint" style={{ margin: 0 }}>
        익명이에요. 한 번만 묻고, 글·댓글과 연결하지 않아요.
      </p>
      <div className="chips" role="radiogroup" aria-label="노방장이 없어진다면">
        {OPTIONS.map((o) => (
          <button key={o.v} type="button" className="chip" role="radio" aria-checked={answer === o.v} onClick={() => setAnswer(o.v)}>
            {o.label}
          </button>
        ))}
      </div>
      {answer && (
        <label className="hint" style={{ display: "grid", gap: 6 }}>
          {answer === 3 ? "무엇이 있으면 다시 오고 싶을까요? (선택)" : "노방장의 어떤 점이 가장 좋았나요? (선택)"}
          <textarea className="input" rows={2} maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="pmf-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={dismiss}>
          다음에
        </button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!answer || state === "sending"} onClick={send}>
          보내기
        </button>
      </div>
    </section>
  );
}
