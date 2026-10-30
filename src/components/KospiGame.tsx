"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { STREAK_SHOW } from "@/lib/kospiGame";
import { pct } from "@/lib/roomQuizzes";
import { Confetti } from "./RoomQuiz";
import { softTap, sparkle } from "@/lib/gameSound";
import { pressFx } from "@/lib/juice";

type Tally = { up: number; down: number };
type Last = { day: string; label: string; mine: 1 | -1; move: 1 | -1 | 0 | null; ok: boolean | null };
type Stats = { wins: number; losses: number; streak: number };
type Card = { day: string; label: string; lockAt: string; mine: 1 | -1 | null; tally: Tally | null; last: Last | null; stats: Stats };
type Rank = { name: string; wins: number; me: boolean };

const SEEN_KEY = "lr:kospiSeen";
const side = (s: 1 | -1) => (s === 1 ? "📈 오른다" : "📉 내린다");

/** 지난 판 결과 한 줄 */
function LastLine({ last }: { last: Last }) {
  const what = `${last.label} 결과`;
  if (last.move === null) return <p className="kospi-last">⏳ {what} 대기 · {last.mine === 1 ? "📈" : "📉"}</p>;
  if (last.move === 0) return <p className="kospi-last">{what}: 보합 · 무효</p>;
  return (
    <p className={`kospi-last${last.ok ? " ok" : ""}`}>
      {what}: {last.move === 1 ? "📈 올랐어요" : "📉 내렸어요"} · {last.ok ? "✅ 맞혔어요!" : "❌ 아쉬워요"}
    </p>
  );
}

function Ranking() {
  const [rows, setRows] = useState<Rank[] | null>(null);
  useEffect(() => {
    api<{ rows: Rank[] }>("/api/kospi/ranking", "GET")
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return null;
  if (!rows.length) return null;
  return (
    <ol className="kospi-rank">
      {rows.map((r, i) => (
        <li key={`${r.name}:${i}`} className={r.me ? "me" : undefined}>
          <span className="kospi-rank-no">{i + 1}</span>
          <span className="kospi-rank-name">{r.name}{r.me ? " (나)" : ""}</span>
          <span className="kospi-rank-rec">{r.wins}승</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * 📈 코스피 맞히기 (10/29 대표님): 투자방 3곳 맨 위. 거래일마다 📈/📉 하나, 오전 9시 마감, 결과는 다음 날 장 마감 뒤.
 * 종목 이름·사라/팔라는 없다 (게임). 고른 뒤에만 다른 사람 비율이 보인다. 맞히면 다음에 왔을 때 🎉 + 🃏 한 장
 */
export function KospiGame({ slug }: { slug: string }) {
  const [d, setD] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [newCard, setNewCard] = useState(false);
  const [rank, setRank] = useState(false);

  useEffect(() => {
    api<Card | null>(`/api/kospi?slug=${encodeURIComponent(slug)}`, "GET")
      .then((x) => {
        setD(x);
        // 맞힌 결과는 처음 볼 때 한 번만 폭죽
        if (x?.last?.ok) {
          try {
            if (window.localStorage.getItem(SEEN_KEY) !== x.last.day) {
              window.localStorage.setItem(SEEN_KEY, x.last.day);
              setConfetti(x.stats.streak >= STREAK_SHOW ? 34 : 22);
              setNewCard(true);
            }
          } catch {}
        }
      })
      .catch(() => {});
  }, [slug]);

  if (!d) return null;

  const pick = async (s: 1 | -1) => {
    setBusy(true);
    setErr(null);
    let nickname: string | null = null;
    try {
      nickname = window.localStorage.getItem("lr:nickname");
    } catch {}
    try {
      setD(await api<Card>("/api/kospi", "POST", { slug, side: s, nickname }));
      setConfetti(10);
      sparkle();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const total = d.tally ? d.tally.up + d.tally.down : 0;
  const games = d.stats.wins + d.stats.losses;
  return (
    <section className="quiz-card kospi-card" aria-label="코스피 맞히기">
      <Confetti size={confetti} />
      <div className="quiz-top">
        <span className="quiz-kicker">📈 코스피 맞히기</span>
        <span className="kospi-chips">
          {d.stats.streak >= STREAK_SHOW && <span className="quiz-streak hot">🔥 연속 {d.stats.streak}</span>}
        </span>
      </div>
      {d.last && <LastLine last={d.last} />}
      {newCard && <p className="quiz-note-line">🃏 +1 · 내 카드 모음에 담았어요</p>}
      <h2 className="quiz-q">{d.label} 코스피, 오를까 내릴까?</h2>
      <p className="quiz-tease">{d.mine ? "결과는 장 마감 뒤" : "오전 9시 마감"}</p>
      <div className="quiz-options kospi-options">
        {([1, -1] as const).map((s) => {
          const n = d.tally ? (s === 1 ? d.tally.up : d.tally.down) : 0;
          const mine = d.mine === s;
          return (
            <button
              key={s}
              type="button"
              className={`quiz-opt${d.mine ? " done" : ""}${mine ? " mine" : ""}`}
              disabled={busy || d.mine !== null}
              onClick={(e) => {
                pressFx(e, 10);
                softTap();
                void pick(s);
              }}
              aria-pressed={mine}
            >
              {d.tally && <span className="quiz-bar" style={{ width: `${pct(n, total)}%` }} />}
              <span className="quiz-label">{mine ? "✓ " : ""}{side(s)}</span>
            </button>
          );
        })}
      </div>
      {d.tally && (
        <p className="quiz-reward">
          📈 {pct(d.tally.up, total)}% · 📉 {pct(d.tally.down, total)}%
        </p>
      )}
      <div className="kospi-foot">
        {games > 0 && <span className="kospi-record">{d.stats.wins}승 {d.stats.losses}패</span>}
        <button type="button" className="kospi-rank-toggle" onClick={() => setRank(!rank)} aria-expanded={rank}>
          🏆 이번 달 순위
        </button>
        {games > 0 && <Link href="/my#notes" className="quiz-notes-count">🃏 내 카드</Link>}
      </div>
      {rank && <Ranking />}
      {err && <p className="error">{err}</p>}
    </section>
  );
}
