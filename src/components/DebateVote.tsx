"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { DebateSide, DebateTally } from "@/lib/repo/debateVotes";
import { PushButton } from "./PushButton";

const pct = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);

/** ⚖️ AI 토론 사람 투표 (Sprint 74). 고르면 사람 결과와 AI 결과를 나란히 */
export function DebateVote({ postId, initial }: { postId: string; initial: DebateTally }) {
  const key = `lr:debate:${postId}`;
  const [t, setT] = useState(initial);
  const [mine, setMine] = useState<DebateSide | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(key);
      if (v === "A" || v === "B") setMine(v);
    } catch {}
  }, [key]);

  const vote = async (side: DebateSide) => {
    if (side === mine) return;
    // 서버 응답 전에 내 표를 먼저 반영
    setT((cur) => {
      const human = { ...cur.human, [side]: cur.human[side] + 1 };
      if (mine) human[mine] = Math.max(0, human[mine] - 1);
      return { ...cur, human };
    });
    setMine(side);
    try {
      window.localStorage.setItem(key, side);
    } catch {}
    try {
      setT(await api<DebateTally>("/api/debate/vote", "POST", { postId, side }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const hn = t.human.A + t.human.B;
  const an = t.ai.A + t.ai.B;
  return (
    <section className="debate-vote" aria-label="투표">
      <div className="debate-sides">
        {(["A", "B"] as const).map((s) => (
          <button key={s} type="button" className={`btn${mine === s ? " btn-primary" : ""}`} onClick={() => vote(s)} aria-pressed={mine === s}>
            {s === "A" ? t.a : t.b}
          </button>
        ))}
      </div>
      {mine && (
        <div className="debate-result" role="status">
          <p>
            🙋 사람 {hn}명 — {t.a} {pct(t.human.A, hn)}% · {t.b} {pct(t.human.B, hn)}%
          </p>
          <p>
            🤖 AI {an}명 — {t.a} {pct(t.ai.A, an)}% · {t.b} {pct(t.ai.B, an)}%
          </p>
          <PushButton label="🔔 내일 새 주제 알림" onLabel="🔔 내일 아침 알려 드릴게요" daily />
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
