"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { DebateSide, DebateTally } from "@/lib/repo/debateVotes";
import { markDailyAction } from "@/lib/streak";
import { GENDER_KEY, GENDER_LABEL, GENDER_MIN, genderSplit, type VoteGender } from "@/lib/genderSplit";
import { PushButton } from "./PushButton";

const pct = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);

/** ⚖️ AI 토론 사람 투표 (Sprint 74). 고르면 사람 결과와 AI 결과를 나란히 */
export function DebateVote({ postId, initial, push = true }: { postId: string; initial: DebateTally; push?: boolean }) {
  const key = `lr:debate:${postId}`;
  const [t, setT] = useState(initial);
  const [mine, setMine] = useState<DebateSide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  // 👫 남녀를 나눠 세는 투표(미혼남녀방)만: "나는 남/여" 한 번 고르면 이 브라우저에 기억 (10/29)
  const split = !!initial.gender;
  const [gender, setGender] = useState<VoteGender | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(key);
      if (v === "A" || v === "B") setMine(v);
      const g = window.localStorage.getItem(GENDER_KEY);
      if (g === "m" || g === "f") setGender(g);
    } catch {}
  }, [key]);

  const pickGender = (g: VoteGender) => {
    setGender(g);
    try {
      window.localStorage.setItem(GENDER_KEY, g);
    } catch {}
  };

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
    setStreak(markDailyAction());
    try {
      setT(await api<DebateTally>("/api/debate/vote", "POST", { postId, side, ...(split && gender ? { gender } : {}) }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const hn = t.human.A + t.human.B;
  const an = t.ai.A + t.ai.B;
  const gs = split ? genderSplit(t.gender) : null;
  return (
    <section className="debate-vote" aria-label="투표">
      {split && !mine && (
        <p className="vote-gender" role="group" aria-label="나는">
          <span className="hint">나는</span>
          {(["m", "f"] as const).map((g) => (
            <button key={g} type="button" className={`chip${gender === g ? " on" : ""}`} aria-pressed={gender === g} onClick={() => pickGender(g)}>
              {g === "m" ? "남" : "여"}
            </button>
          ))}
          <span className="hint">(안 골라도 투표돼요)</span>
        </p>
      )}
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
          {split &&
            (gs ? (
              <p className="vote-gender-result">
                👫 {GENDER_LABEL.m} {t.a} {gs.m.A}% · {t.b} {gs.m.B}% / {GENDER_LABEL.f} {t.a} {gs.f.A}% · {t.b} {gs.f.B}%
              </p>
            ) : (
              <p className="hint">👫 남녀 결과는 각 {GENDER_MIN}명 이상 모이면 보여요</p>
            ))}
          {streak > 1 && <p className="daily-streak">🔥 {streak}일 연속</p>}
          {an > 0 && (
            <p>
              🤖 AI {an}명 — {t.a} {pct(t.ai.A, an)}% · {t.b} {pct(t.ai.B, an)}%
            </p>
          )}
          {push && <PushButton label="🔔 내일 새 질문 알림" onLabel="🔔 내일 아침 알려 드릴게요" daily />}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
