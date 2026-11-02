"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { myNick, saveNick } from "@/lib/me";
import { BADGE_STREAK, PREDICT_ROOMS } from "@/lib/predictions";
import { softTap, sparkle } from "@/lib/gameSound";
import { Confetti } from "./RoomQuiz";

type Open = { id: string; title: string; options: string[]; closesAt: string; mine: number | null; tally: number[] | null };
type Done = { id: string; title: string; options: string[]; answer: number; mine: number | null; ok: boolean | null; points: number; sourceUrl: string | null };
type Me = { score: number; wins: number; losses: number; streak: number };
type Board = { name: string; score: number; wins: number; me: boolean };
type Card = { room: string; open: Open[]; recent: Done[]; me: Me; board: Board[] };

/** 마감까지 "3시간 12분" */
function untilLabel(iso: string, now: number): string {
  const m = Math.max(0, Math.ceil((Date.parse(iso) - now) / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}일 ${h}시간` : h > 0 ? `${h}시간 ${m % 60}분` : `${m}분`;
}

const pct = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);

/**
 * 🎯 승부 예측 탭 (11/2 대표님 "k리그, kbo, 게임 승부 예측 좋다. 보상은 배지, 그리고 스코어까지. 드라마 시청률 맞히기도").
 * 열린 문제마다 한 번 고르면 끝(바꿀 수 없음), 고른 뒤에 다른 사람 비율. 결과가 나오면 점수, 3연속부터 닉네임 옆 🎯 배지
 */
export function PredictionBoard({ room }: { room: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [nick, setNick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const info = PREDICT_ROOMS[room];

  useEffect(() => {
    const n = myNick();
    setNick(n);
    api<Card | null>(`/api/predictions?room=${encodeURIComponent(room)}${n ? `&nick=${encodeURIComponent(n)}` : ""}`, "GET")
      .then(setCard)
      .catch(() => setError("불러오지 못했어요. 잠시 후 다시 열어 주세요."));
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [room]);

  const pick = async (id: string, choice: number) => {
    setError(null);
    try {
      navigator.vibrate?.(15);
    } catch {}
    softTap();
    if (nick.trim()) saveNick(nick);
    try {
      const next = await api<Card>("/api/predictions", "POST", { id, choice, nickname: nick.trim() || null });
      setCard(next);
      setBurst((b) => b + 1);
      setTimeout(sparkle, 120);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const share = async () => {
    if (!card) return;
    const text = `노방장 ${info?.label ?? "🎯 승부 예측"} · ${card.me.wins}승 ${card.me.losses}패 · ${card.me.score}점${card.me.streak >= BADGE_STREAK ? ` · 🔥${card.me.streak}연속` : ""}\n나도 맞혀 보기 👉`;
    const url = `${location.origin}/c/${encodeURIComponent(room)}?tab=predict&from=share`;
    try {
      if (navigator.share) await navigator.share({ text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setError("📋 복사했어요. 친구에게 붙여 넣어 보내 주세요.");
      }
    } catch {}
  };

  if (!info) return null;
  if (!card) return <section className="predict">{error ? <p className="error">{error}</p> : <p className="hint">불러오는 중…</p>}</section>;

  return (
    <section className="predict" aria-label={info.label}>
      {burst > 0 && <Confetti key={burst} size={14} />}
      <p className="hint">{info.intro}</p>
      <div className="predict-me">
        <b>내 기록</b> {card.me.wins}승 {card.me.losses}패 · <b>{card.me.score}점</b>
        {card.me.streak > 0 && <span> · 🔥 {card.me.streak}연속</span>}
        {card.me.streak < BADGE_STREAK && <span className="hint"> · {BADGE_STREAK}연속부터 닉네임 옆 🎯 배지</span>}
      </div>
      <label className="predict-nick">
        <span>닉네임 (순위에 보여요, 선택)</span>
        <input value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} placeholder="예) 수원직관러" />
      </label>

      {card.open.length === 0 ? (
        <p className="hint">지금 열린 문제가 없어요. 다음 경기·방송 전에 새 문제가 올라와요.</p>
      ) : (
        card.open.map((q) => {
          const n = q.tally ? q.tally.reduce((a, b) => a + b, 0) : 0;
          return (
            <article key={q.id} className="predict-q">
              <h3>{q.title}</h3>
              <p className="hint">⏰ 마감까지 {untilLabel(q.closesAt, now)}</p>
              <div className="predict-opts">
                {q.options.map((o, i) => (
                  <button key={o} type="button" className={`btn vote-btn${q.mine === i ? " btn-primary" : ""}`} disabled={q.mine !== null} aria-pressed={q.mine === i} onClick={() => void pick(q.id, i)}>
                    {o}
                    {q.tally && <span className="predict-pct"> {pct(q.tally[i] ?? 0, n)}%</span>}
                  </button>
                ))}
              </div>
              {q.mine !== null && <p className="hint">✅ 골랐어요 · {n}명 참여 · 결과가 나오면 점수가 들어와요</p>}
            </article>
          );
        })
      )}

      {card.recent.length > 0 && (
        <details className="predict-recent" open>
          <summary>지난 결과</summary>
          <ul>
            {card.recent.map((r) => (
              <li key={r.id}>
                {r.ok === true ? "✅" : r.ok === false ? "❌" : "·"} {r.title}: <b>{r.options[r.answer]}</b>
                {r.ok === true && <span> +{r.points}점</span>}
                {r.sourceUrl && (
                  <>
                    {" "}
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">출처</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <h3 className="predict-board-title">🏆 이번 주 순위</h3>
      {card.board.length === 0 ? (
        <p className="hint">아직 점수를 얻은 사람이 없어요. 첫 1등이 되어 보세요.</p>
      ) : (
        <ol className="kospi-rank">
          {card.board.map((b, i) => (
            <li key={`${b.name}:${i}`} className={b.me ? "me" : undefined}>
              <span className="kospi-rank-no">{i + 1}</span>
              <span className="kospi-rank-name">{b.name}{b.me ? " (나)" : ""}</span>
              <span className="kospi-rank-rec">{b.score}점</span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn" onClick={() => void share()}>📣 내 기록 친구에게 보내기</button>
      {error && <p className="hint">{error}</p>}
    </section>
  );
}
