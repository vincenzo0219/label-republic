"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { isPair, KMATCH_MAX_MS, KMATCH_PENALTY_MS, type KMatchBoard } from "@/lib/kMatch";
import { myNick } from "@/lib/me";
import { formatScore } from "@/lib/miniGames";
import { DailyExtras } from "./DailyExtras";
import { ChallengeIntro, ChallengeVerdict, MyRankLine, useChallenge } from "./GameRank";
import { TeamPredict } from "./TeamPredict";
import { GoCountdown, useAutoGo } from "./AutoGo";
import { Versus, VsIntro, useVs } from "./Versus";

type Today = { day: string; no: number; board: KMatchBoard; played: number | null };
type Result = { score: number; ranked: boolean };

const K_ROOM = "/c/k리그-덕후방";
const fmt = (n: number) => formatScore("kmatch", n);

/** 🏟️ K리그 구단·홈구장 짝 맞추기 (11/4): 구단을 누르고 홈구장을 누른다. 틀리면 +3초 */
export function KMatchGame() {
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState(false);
  const [phase, setPhase] = useState<"ready" | "play" | "done">("ready");
  const [club, setClub] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [wrong, setWrong] = useState(0);
  const [bad, setBad] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [round, setRound] = useState(0);
  const started = useRef(0);
  const vs = useVs(KMATCH_MAX_MS, 0);
  const target = useChallenge("kmatch", !!vs, round);

  useEffect(() => {
    api<Today>("/api/kmatch", "GET")
      .then(setToday)
      .catch(() => setError(true));
    api("/api/games/kmatch/open", "POST", { src: new URLSearchParams(window.location.search).get("from") === "room" ? "room" : "direct" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const id = window.setInterval(() => setNow(Date.now() - started.current), 100);
    return () => window.clearInterval(id);
  }, [phase]);

  const start = () => {
    started.current = Date.now();
    setDone([]);
    setWrong(0);
    setClub(null);
    setResult(null);
    setNow(0);
    setPhase("play");
  };
  const count = useAutoGo(!!today, start, true);

  const finish = async (w: number) => {
    const ms = Date.now() - started.current;
    setPhase("done");
    try {
      const r = await api<Result>("/api/kmatch", "POST", { ms: Math.min(KMATCH_MAX_MS, ms), wrong: w, ...(myNick() ? { nickname: myNick() } : {}) });
      setResult(r);
      if (r.ranked) setToday((t) => (t ? { ...t, played: r.score } : t));
    } catch {
      setError(true);
    }
  };

  const pickStadium = (stadium: string) => {
    if (!club || !today) return;
    if (isPair(club, stadium)) {
      const d = [...done, club];
      setDone(d);
      setClub(null);
      if (d.length >= today.board.clubs.length) void finish(wrong);
    } else {
      setWrong((x) => x + 1);
      setBad(stadium);
      window.setTimeout(() => setBad(null), 350);
    }
  };

  if (error && !today) return <p className="error">문제를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>;
  if (!today) return <p className="hint">문제를 불러오는 중이에요.</p>;

  if (phase === "ready" && count !== null) return <GoCountdown n={count} label={`🏟️ 오늘의 짝 맞추기 · ${today.no}회`} />;
  if (phase === "ready")
    return (
      <section className="ear-card km-start">
        <p className="ear-kicker">🏟️ 오늘의 짝 맞추기 · {today.no}회</p>
        <h2 className="ear-title">K리그 구단과 홈구장을 짝지어요</h2>
        <p className="hint">6쌍 · 전국이 같은 문제 · 틀리면 +3초 · 빨리 끝낼수록 순위가 올라가요</p>
        <VsIntro vs={vs} format={fmt} />
        {!vs && <ChallengeIntro game="kmatch" c={target} />}
        {today.played !== null && <p className="hint bs-played">오늘 랭킹 기록은 <b>{fmt(today.played)}</b>예요. 다시 하면 연습으로만 쳐요.</p>}
        <button type="button" className="btn btn-primary ear-start" onClick={start}>
          ▶ 바로 시작
        </button>
        <details className="ear-more">
          <summary>어떻게 하나요?</summary>
          <p className="hint">왼쪽 구단을 누르고, 그 구단 홈구장을 오른쪽에서 눌러요. 2026시즌 K리그1 12개 구단 중 매일 6개가 나와요. 랭킹에는 오늘 첫 판만 들어가요.</p>
        </details>
      </section>
    );

  if (phase === "play") {
    const stadiumDone = new Set(done.map((c) => today.board.stadiums.find((s) => isPair(c, s))));
    return (
      <section className="ear-card km-play" aria-live="polite">
        <div className="ac-top">
          <span className="ac-time">⏱ {((now + wrong * KMATCH_PENALTY_MS) / 1000).toFixed(1)}초</span>
          <span className="ac-count">{done.length} / {today.board.clubs.length}{wrong ? ` · 틀림 ${wrong}` : ""}</span>
        </div>
        <div className="km-grid">
          <div className="km-col">
            {today.board.clubs.map((c) => (
              <button key={c} type="button" className={`btn km-card${club === c ? " on" : ""}${done.includes(c) ? " ok" : ""}`} disabled={done.includes(c)} onClick={() => setClub(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="km-col">
            {today.board.stadiums.map((s) => (
              <button key={s} type="button" className={`btn km-card${stadiumDone.has(s) ? " ok" : ""}${bad === s ? " bad" : ""}`} disabled={stadiumDone.has(s) || !club} onClick={() => pickStadium(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">{club ? `${club} 홈구장은?` : "왼쪽에서 구단을 먼저 눌러요"}</p>
      </section>
    );
  }

  if (!result) return <p className="hint">기록을 남기는 중이에요.</p>;
  return (
    <section className="ear-card km-result">
      <p className="ear-kicker">🏟️ 오늘의 짝 맞추기 · {today.no}회</p>
      <p className="ear-score">
        <b>{fmt(result.score)}</b>
      </p>
      <p className="hint">{wrong ? `틀림 ${wrong}번(+${wrong * 3}초) · ` : "한 번도 안 틀렸어요 · "}{result.ranked ? "오늘 랭킹에 올렸어요" : "연습 판이라 랭킹에는 넣지 않았어요"}</p>
      {!vs && <ChallengeVerdict game="kmatch" c={target} score={result.score} />}
      <MyRankLine key={`${round}-${result.score}`} game="kmatch" />
      <DailyExtras game="kmatch" refresh={round} />
      <Versus vs={vs} mine={result.score} path="/games/kmatch" label="🏟️ K리그 구단·홈구장 짝 맞추기" format={fmt} lowerBetter cta="🔗 내 기록에 도전장" />
      <TeamPredict />
      <div className="ear-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setRound((r) => r + 1);
            start();
          }}
        >
          다시 하기 (연습)
        </button>
        <Link href={K_ROOM} className="btn">
          ⚽ K리그 덕후방으로
        </Link>
      </div>
    </section>
  );
}
