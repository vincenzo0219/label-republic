"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { QUESTIONS_PER_DAY, SCORE_MAX, type DailyQuestion } from "@/lib/firstSentenceGame";
import { myNick } from "@/lib/me";
import { formatScore } from "@/lib/miniGames";
import { ChallengeIntro, ChallengeVerdict, MyRankLine, useChallenge } from "./GameRank";
import { Versus, VsIntro, useVs } from "./Versus";

type Today = { day: string; no: number; questions: DailyQuestion[]; played: number | null };
type Result = { correct: number; score: number; ranked: boolean; answers: { id: string; title: string; author: string; ok: boolean }[] };

const BOOK_ROOM = "/c/읽는-책-제목을-교환해-보자";
const fmt = (n: number) => formatScore("booksent", n);

/** 📖 오늘의 첫 문장 맞히기 (11/4): 하루 한 판 10문제, 전국 랭킹은 그날 첫 판만 */
export function BookSentenceGame() {
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState(false);
  const [step, setStep] = useState(-1); // -1 시작 전, 0~9 문제, 10 끝
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [round, setRound] = useState(0);
  const picks = useRef<(string | null)[]>([]);
  const started = useRef(0);
  const vs = useVs(SCORE_MAX);
  const target = useChallenge("booksent", !!vs, round);

  useEffect(() => {
    api<Today>("/api/book-sentence-game", "GET")
      .then(setToday)
      .catch(() => setError(true));
    api("/api/games/booksent/open", "POST", { src: new URLSearchParams(window.location.search).get("from") === "room" ? "room" : "direct" }).catch(() => {});
  }, []);

  const start = () => {
    picks.current = [];
    started.current = Date.now();
    setResult(null);
    setPicked(null);
    setStep(0);
  };

  const finish = async () => {
    const ms = Date.now() - started.current;
    setStep(QUESTIONS_PER_DAY);
    try {
      const r = await api<Result>("/api/book-sentence-game", "POST", { picks: picks.current, ms, ...(myNick() ? { nickname: myNick() } : {}) });
      setResult(r);
      if (r.ranked) setToday((t) => (t ? { ...t, played: r.score } : t));
    } catch {
      setError(true);
    }
  };

  const pick = (title: string) => {
    if (picked || !today) return;
    setPicked(title);
    picks.current[step] = title;
    window.setTimeout(() => {
      setPicked(null);
      if (step + 1 >= QUESTIONS_PER_DAY) void finish();
      else setStep(step + 1);
    }, 650);
  };

  if (error && !today) return <p className="error">문제를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>;
  if (!today) return <p className="hint">문제를 불러오는 중이에요.</p>;

  if (step < 0)
    return (
      <section className="ear-card bs-start">
        <p className="ear-kicker">📖 오늘의 첫 문장 · {today.no}회</p>
        <h2 className="ear-title">첫 문장만 보고 어떤 책인지 맞혀요</h2>
        <p className="hint">10문제 · 전국이 같은 문제 · 많이 맞히고 빨리 끝낼수록 순위가 올라가요</p>
        <VsIntro vs={vs} format={fmt} />
        {!vs && <ChallengeIntro game="booksent" c={target} />}
        {today.played !== null && <p className="hint bs-played">오늘 랭킹 기록은 <b>{fmt(today.played)}</b>예요. 다시 하면 연습으로만 쳐요.</p>}
        <button type="button" className="btn btn-primary ear-start" onClick={start}>
          ▶ 바로 시작
        </button>
        <details className="ear-more">
          <summary>어떻게 하나요?</summary>
          <p className="hint">한국 작품은 원문 그대로, 외국 작품은 원문 첫 문장을 노방장이 직접 옮겼어요. 모두 저작권이 끝난 작품이에요. 랭킹에는 오늘 첫 판만 들어가고, 문제는 매일 0시에 바뀌어요.</p>
        </details>
      </section>
    );

  if (step < QUESTIONS_PER_DAY) {
    const q = today.questions[step]!;
    return (
      <section className="ear-card" aria-live="polite">
        <div className="ear-progress" aria-label={`${QUESTIONS_PER_DAY}문제 중 ${step + 1}번째`}>
          {step + 1} / {QUESTIONS_PER_DAY}
        </div>
        <blockquote className="fl-line">{q.text}</blockquote>
        {q.translated && <p className="hint bs-tr">직접 옮긴 문장</p>}
        <h2 className="ear-q">무슨 책일까요?</h2>
        <div className="fl-choices">
          {q.options.map((t) => (
            <button key={t} type="button" className={`btn fl-choice${picked === t ? " picked" : ""}`} disabled={!!picked} onClick={() => pick(t)}>
              {t}
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (!result) return <p className="hint">채점하는 중이에요.</p>;
  return (
    <section className="ear-card bs-result">
      <p className="ear-kicker">📖 오늘의 첫 문장 · {today.no}회</p>
      <p className="ear-score">
        <b>{result.correct}</b> / {QUESTIONS_PER_DAY}
      </p>
      <p className="hint">{fmt(result.score)} · {result.ranked ? "오늘 랭킹에 올렸어요" : "연습 판이라 랭킹에는 넣지 않았어요"}</p>
      {!vs && <ChallengeVerdict game="booksent" c={target} score={result.score} />}
      <MyRankLine key={`${round}-${result.score}`} game="booksent" />
      <Versus vs={vs} mine={result.score} path="/games/booksent" label="📖 오늘의 첫 문장 맞히기" format={fmt} cta="🔗 내 기록에 도전장" />
      <details className="fl-review">
        <summary>정답 보기</summary>
        <ol>
          {result.answers.map((a) => (
            <li key={a.id}>
              {a.ok ? "⭕" : "❌"} {a.title} · {a.author}
            </li>
          ))}
        </ol>
      </details>
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
        <Link href={BOOK_ROOM} className="btn">
          📚 책 덕후방으로
        </Link>
      </div>
    </section>
  );
}
