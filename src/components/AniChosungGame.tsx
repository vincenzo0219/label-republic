"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ANI_SCORE_MAX, ANI_SECONDS, answerHash, type AniQuestion } from "@/lib/aniChosung";
import { api } from "@/lib/client-api";
import { myNick } from "@/lib/me";
import { formatScore } from "@/lib/miniGames";
import { DailyExtras } from "./DailyExtras";
import { ChallengeIntro, ChallengeVerdict, MyRankLine, useChallenge } from "./GameRank";
import { GoCountdown, useAutoGo } from "./AutoGo";
import { Versus, VsIntro, useVs } from "./Versus";

type Today = { day: string; no: number; questions: AniQuestion[]; played: number | null };
type Result = { correct: number; score: number; ranked: boolean; results: { title: string; ok: boolean; mine: string }[] };

const ANI_ROOM = "/c/애니-만화-덕후방";
const fmt = (n: number) => formatScore("anichosung", n);

/** 🎨 애니 제목 초성 60초 (11/4): 하루 한 판, 전국 같은 순서. 맞히면 바로 다음 문제 */
export function AniChosungGame() {
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState(false);
  const [phase, setPhase] = useState<"ready" | "play" | "done">("ready");
  const [k, setK] = useState(0);
  const [typed, setTyped] = useState("");
  const [left, setLeft] = useState(ANI_SECONDS);
  const [flash, setFlash] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [round, setRound] = useState(0);
  const answers = useRef<string[]>([]);
  const started = useRef(0);
  const lastMs = useRef(0);
  const ended = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const vs = useVs(ANI_SCORE_MAX);
  const target = useChallenge("anichosung", !!vs, round);

  useEffect(() => {
    api<Today>("/api/ani-chosung", "GET")
      .then(setToday)
      .catch(() => setError(true));
    api("/api/games/anichosung/open", "POST", { src: new URLSearchParams(window.location.search).get("from") === "room" ? "room" : "direct" }).catch(() => {});
  }, []);

  const finish = async () => {
    if (ended.current) return;
    ended.current = true;
    setPhase("done");
    try {
      const r = await api<Result>("/api/ani-chosung", "POST", { answers: answers.current, lastMs: lastMs.current, ...(myNick() ? { nickname: myNick() } : {}) });
      setResult(r);
      if (r.ranked) setToday((t) => (t ? { ...t, played: r.score } : t));
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    if (phase !== "play") return;
    const id = window.setInterval(() => {
      const l = Math.max(0, ANI_SECONDS - Math.floor((Date.now() - started.current) / 1000));
      setLeft(l);
      if (l <= 0) void finish();
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = () => {
    answers.current = [];
    lastMs.current = 0;
    ended.current = false;
    started.current = Date.now();
    setResult(null);
    setTyped("");
    setK(0);
    setLeft(ANI_SECONDS);
    setPhase("play");
    window.setTimeout(() => input.current?.focus(), 50);
  };
  const count = useAutoGo(!!today, start, true);

  const next = (answer: string) => {
    if (!today || ended.current) return;
    answers.current[k] = answer;
    setTyped("");
    if (k + 1 >= today.questions.length) return void finish();
    setK(k + 1);
    input.current?.focus();
  };

  const onType = (v: string) => {
    setTyped(v);
    const q = today?.questions[k];
    if (!q || !v.trim()) return;
    if (q.hashes.includes(answerHash(v))) {
      lastMs.current = Date.now() - started.current;
      setFlash(true);
      window.setTimeout(() => setFlash(false), 300);
      next(v);
    }
  };

  if (error && !today) return <p className="error">문제를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>;
  if (!today) return <p className="hint">문제를 불러오는 중이에요.</p>;

  if (phase === "ready" && count !== null) return <GoCountdown n={count} label={`🎨 오늘의 애니 초성 · ${today.no}회`} />;
  if (phase === "ready")
    return (
      <section className="ear-card ac-start">
        <p className="ear-kicker">🎨 오늘의 애니 초성 · {today.no}회</p>
        <h2 className="ear-title">초성만 보고 애니 제목을 적어요</h2>
        <p className="hint">60초 · 전국이 같은 순서 · 많이 맞힐수록 순위가 올라가요</p>
        <VsIntro vs={vs} format={fmt} />
        {!vs && <ChallengeIntro game="anichosung" c={target} />}
        {today.played !== null && <p className="hint bs-played">오늘 랭킹 기록은 <b>{fmt(today.played)}</b>예요. 다시 하면 연습으로만 쳐요.</p>}
        <button type="button" className="btn btn-primary ear-start" onClick={start}>
          ▶ 바로 시작
        </button>
        <details className="ear-more">
          <summary>어떻게 하나요?</summary>
          <p className="hint">맞히면 바로 다음 문제로 넘어가요. 모르면 "패스". 띄어쓰기·문장부호는 안 봐요. 제목은 국내에서 방영·개봉한 이름이에요. 랭킹에는 오늘 첫 판만 들어가고, 문제는 매일 0시에 바뀌어요.</p>
        </details>
      </section>
    );

  if (phase === "play") {
    const q = today.questions[k]!;
    const right = answers.current.filter(Boolean).length;
    return (
      <section className="ear-card ac-play" aria-live="polite">
        <div className="ac-top">
          <span className="ac-time">⏱ {left}초</span>
          <span className="ac-count">맞힌 {right}개</span>
        </div>
        <p className={`ac-cho${flash ? " ok" : ""}`}>{q.cho}</p>
        <p className="hint ac-len">{q.len}글자 (띄어쓰기 빼고)</p>
        <input
          ref={input}
          className="ac-input"
          value={typed}
          onChange={(e) => onType(e.target.value)}
          placeholder="제목을 적어요"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          aria-label="애니 제목"
        />
        <button type="button" className="btn btn-ghost ac-pass" onClick={() => next("")}>
          패스 →
        </button>
      </section>
    );
  }

  if (!result) return <p className="hint">채점하는 중이에요.</p>;
  return (
    <section className="ear-card ac-result">
      <p className="ear-kicker">🎨 오늘의 애니 초성 · {today.no}회</p>
      <p className="ear-score">
        <b>{result.correct}</b>개 맞혔어요
      </p>
      <p className="hint">{fmt(result.score)} · {result.ranked ? "오늘 랭킹에 올렸어요" : "연습 판이라 랭킹에는 넣지 않았어요"}</p>
      {!vs && <ChallengeVerdict game="anichosung" c={target} score={result.score} />}
      <MyRankLine key={`${round}-${result.score}`} game="anichosung" />
      <DailyExtras game="anichosung" refresh={round} />
      <Versus vs={vs} mine={result.score} path="/games/anichosung" label="🎨 애니 제목 초성 60초" format={fmt} cta="🔗 내 기록에 도전장" />
      {result.results.length > 0 && (
        <details className="fl-review">
          <summary>정답 보기</summary>
          <ol>
            {result.results.map((r, i) => (
              <li key={i}>
                {r.ok ? "⭕" : "➖"} {r.title}
              </li>
            ))}
          </ol>
        </details>
      )}
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
        <Link href={ANI_ROOM} className="btn">
          🎨 애니·만화 덕후방으로
        </Link>
      </div>
    </section>
  );
}
