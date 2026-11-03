"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { softTap, sparkle } from "@/lib/gameSound";
import { myNick } from "@/lib/me";
import { kTeamIn, kTeamPlays } from "@/lib/peers";
import { PK_TEAM_KEY } from "@/lib/pk";

type Open = { id: string; title: string; options: string[]; closesAt: string; mine: number | null; tally: number[] | null };
type Done = { id: string; title: string; options: string[]; answer: number; ok: boolean | null; points: number; rate: number | null };
type Card = { open: Open[]; recent?: Done[] };

const KLEAGUE = "k리그-덕후방";
const SHOW = 3;
const pct = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);

/**
 * ⚽ 내 팀 경기 맞히기 (11/2 대표님 "응원하는 팀 한 줄 자기소개 한 사람들이 경기 예측도 이어서 하게, 승부 예측 탭과 연결").
 * 팀 자기소개 글·팬 테스트 결과 아래에서 🎯 예측 탭 문제를 바로 고른다. 내 팀(팬 테스트에서 고른 팀, 방금 단 댓글의 팀) 경기가 맨 위
 */
export function TeamPredict({ team: initialTeam, room = KLEAGUE }: { team?: string | null; room?: string }) {
  const ROOM = room;
  const teamRoom = room === KLEAGUE;
  const [card, setCard] = useState<Card | null>(null);
  const [team, setTeam] = useState<string | null>(initialTeam ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (!initialTeam) setTeam(localStorage.getItem(PK_TEAM_KEY) || null);
    } catch {}
    const n = myNick();
    api<Card | null>(`/api/predictions?room=${encodeURIComponent(ROOM)}${n ? `&nick=${encodeURIComponent(n)}` : ""}`, "GET")
      .then((c) => setCard(c))
      .catch(() => {});
    const onComment = (e: Event) => {
      const t = kTeamIn(String((e as CustomEvent).detail ?? ""));
      if (!t) return;
      setTeam(t);
      try {
        localStorage.setItem(PK_TEAM_KEY, t);
      } catch {}
    };
    window.addEventListener("lr:commented", onComment);
    return () => window.removeEventListener("lr:commented", onComment);
  }, [initialTeam]);

  if (!card || card.open.length === 0) return null;
  const team_ = teamRoom ? team : null;
  const mineFirst = [...card.open].sort((a, b) => Number(!!team_ && kTeamPlays(b.title, team_)) - Number(!!team_ && kTeamPlays(a.title, team_)));
  const shown = mineFirst.slice(0, SHOW);
  const hasMine = !!team_ && shown.some((q) => kTeamPlays(q.title, team_));

  const pick = async (id: string, choice: number) => {
    softTap();
    try {
      const next = await api<Card>("/api/predictions", "POST", { id, choice, nickname: myNick() || null });
      setCard(next);
      setTimeout(sparkle, 120);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="team-predict" aria-label="경기 맞히기">
      <b>{room === "드라마-덕후방" ? "🔮" : "🎯"} {hasMine ? `${team_} 경기, 맞혀 볼래요?` : room === "드라마-덕후방" ? "다음 화, 맞혀 볼래요?" : teamRoom ? "이번 라운드, 맞혀 볼래요?" : "맞혀 볼래요?"}</b>
      {shown.map((q) => {
        const n = q.tally ? q.tally.reduce((a, b) => a + b, 0) : 0;
        const my = !!team_ && kTeamPlays(q.title, team_);
        return (
          <article key={q.id} className={`team-predict-q${my ? " mine" : ""}`}>
            <p>{my ? "⭐ " : ""}{q.title.replace(/, 결과는\?$/, "")}</p>
            <div className="predict-opts">
              {q.options.map((o, i) => (
                <button key={o} type="button" className={`btn vote-btn${q.mine === i ? " btn-primary" : ""}`} disabled={q.mine !== null} aria-pressed={q.mine === i} onClick={() => void pick(q.id, i)}>
                  {o}
                  {q.tally && <span className="predict-pct"> {pct(q.tally[i] ?? 0, n)}%</span>}
                </button>
              ))}
            </div>
          </article>
        );
      })}
      {card.recent?.[0] && (() => {
        const r = card.recent[0]!;
        return (
          <p className="hint team-predict-last">
            {r.ok === true ? `✅ 맞혔어요 +${r.points}점 · ` : r.ok === false ? "❌ " : ""}지난 결과 {r.title.replace(/, 결과는\?$/, "")}: <b>{r.options[r.answer]}</b>
            {r.rate !== null && ` · 맞힌 사람 ${r.rate}%`}
          </p>
        );
      })()}
      <p className="hint">
        맞히면 10점, 3연속이면 닉네임 옆 🎯 ·{" "}
        <Link href={`/c/${encodeURIComponent(ROOM)}?tab=predict`}>{card.open.length > SHOW ? `전체 ${card.open.length}개·순위 →` : "순위 보기 →"}</Link>
      </p>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
