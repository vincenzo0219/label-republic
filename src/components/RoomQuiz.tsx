"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { roomEmoji, roomShortName } from "@/lib/myRooms";
import { pct, streakTier, type RoomQuiz as Quiz } from "@/lib/roomQuizzes";
import { RoomPoll } from "./RoomPoll";
import { chime, softTap, sparkle } from "@/lib/gameSound";
import { pressFx } from "@/lib/juice";

type Tally = { total: number; counts: Record<string, number> };
type Me = { streak: number; best: number; freezeLeft: 0 | 1 };
type Notes = { knowledge: number; total: number };
type Data =
  | ({ source: "poll"; day: string } & Me)
  | ({
      source: "db" | "builtin";
      day: string;
      quiz: Quiz;
      tally: Tally;
      mine: string | null;
      notes: Notes;
      progress: number;
    } & Me);

/** 이 수 이상일 때만 "오늘 n명 참여" (지어낸 숫자 X). 답하기 전에는 % 를 보이지 않는다 */
const SHOW_COUNT_MIN = 5;
/** 박사까지 (src/lib/repo/roomQuizzes.ts NOTE_TITLE_MIN 과 같게) */
const TITLE_MIN = 10;
/** 결과를 보여 주기 전 잠깐 뜸 */
const SUSPENSE_MS = 300;

/** 🎉 카드 안에서만 1초 반짝. 답할 때마다 작게, 정답·칭호·연속 고비(3·7·30일)는 크게 (10/29 대표님 "손맛, 폭죽 진행"). 움직임 줄이기 설정이면 안 보임 */
export function Confetti({ size }: { size: number }) {
  if (!size) return null;
  return (
    <span className="quiz-confetti" aria-hidden>
      {Array.from({ length: size }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 7) * 40}ms`,
            background: ["#ff6b5f", "#ffb357", "#3ddc97", "#5fd3ff", "#c79bff"][
              i % 5
            ],
          }}
        />
      ))}
    </span>
  );
}

/** 🔥 연속: 끊겨도 혼내지 않는다 ("다시 시작해요"), 쉬는 날 남은 것도 알려 준다 */
function StreakChip({ me }: { me: Me }) {
  if (me.streak < 1) return null;
  if (me.streak === 1 && me.best > 1)
    return <span className="quiz-streak">다시 시작해요 🔥1</span>;
  return (
    <span className={`quiz-streak${streakTier(me.streak) ? " hot" : ""}`}>
      🔥 {me.streak}일 연속
      {me.streak >= 2 && me.freezeLeft ? " · 🧊 쉬는 날 1번 남음" : ""}
    </span>
  );
}

/** 공감 퀴즈는 보기 순서를 사람마다 섞는다 (첫 보기 쏠림 줄이기). 정답 퀴즈는 그대로 */
function useOrder(n: number, key: string, shuffle: boolean): number[] {
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    try {
      let s = window.localStorage.getItem("lr:quizSeed");
      if (!s)
        window.localStorage.setItem(
          "lr:quizSeed",
          (s = String(Math.floor(Math.random() * 1e9))),
        );
      setSeed(Number(s) || 1);
    } catch {
      setSeed(1);
    }
  }, []);
  return useMemo(() => {
    const idx = Array.from({ length: n }, (_, i) => i);
    if (!shuffle || !seed) return idx;
    let s = seed;
    for (const ch of key) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    for (let i = idx.length - 1; i > 0; i--) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const j = s % (i + 1);
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    return idx;
  }, [n, key, shuffle, seed]);
}

/** 답한 뒤에는 내 카드 장수만 (10/30 대표님 "다른방 퀴즈는 안내하지마") */
function NextStep({ notes }: { slug: string; notes: number }) {
  return (
    <div className="quiz-next">
      <Link href="/my#notes" className="quiz-notes-count">
        🃏 내 카드 {notes}장
      </Link>
    </div>
  );
}

/**
 * 🧩 방 맨 위 오늘의 1분 퀴즈 (10/29 대표님). 한 번 눌러 답하고, 답한 뒤에만 "나와 같은 선택 n%"·정답률이 보인다.
 * 정답 퀴즈는 ✅/❌·정답·한 줄 설명·출처, 유형 테스트(주 1회)는 기분 좋은 결과 카드. 기존 오늘의 질문이 있는 방은 그 카드를 쓴다.
 * 알림(푸시)·진동은 쓰지 않는다: 화면 안에서만.
 */
export function RoomQuiz({ slug, name }: { slug: string; name: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [plusOne, setPlusOne] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Data | null>(`/api/room-quiz?slug=${encodeURIComponent(slug)}`, "GET")
      .then((x) => {
        setD(x);
        if (x && x.source !== "poll" && x.mine !== null) setRevealed(true);
      })
      .catch(() => {});
  }, [slug]);

  // 본 사람 (응답률 분모): 카드가 화면에 보이면 한 번
  useEffect(() => {
    if (!d || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        try {
          const body = new Blob([JSON.stringify({ slug })], {
            type: "application/json",
          });
          if (!navigator.sendBeacon?.("/api/room-quiz/seen", body))
            void fetch("/api/room-quiz/seen", {
              method: "POST",
              body,
              keepalive: true,
            });
        } catch {}
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [d, slug]);

  const quiz = d && d.source !== "poll" ? d.quiz : null;
  const order = useOrder(
    quiz && quiz.kind !== "type" ? quiz.options.length : 0,
    `${slug}:${d?.day ?? ""}`,
    quiz?.kind === "pick",
  );

  if (!d) return null;
  if (d.source === "poll") {
    return (
      <div ref={ref} className="quiz-wrap">
        {d.streak > 0 && (
          <div className="quiz-streak-row">
            <StreakChip me={d} />
          </div>
        )}
        <RoomPoll slug={slug} />
      </div>
    );
  }

  const q = d.quiz;
  const send = async (body: { choice?: number; picks?: number[] }) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<
        { mine: string; tally: Tally; notes: Notes; progress: number } & Me
      >("/api/room-quiz", "POST", { slug, ...body });
      setD({
        ...d,
        mine: r.mine,
        tally: r.tally,
        streak: r.streak,
        best: r.best,
        freezeLeft: r.freezeLeft,
        notes: r.notes,
        progress: r.progress,
      });
      setPlusOne(true);
      const milestone = r.streak >= 3 && streakTier(r.streak) === r.streak;
      const right = q.kind === "trivia" && r.mine === String(q.answer);
      // 🎓 카드 10장째 되는 순간만 칭호를 깜짝 공개 (진도 막대는 숙제 같아서 뺐다, 10/29 대표님)
      const justTitled = r.progress === TITLE_MIN;
      window.setTimeout(() => {
        setRevealed(true);
        // 결과가 열릴 때: 맞혔거나 기념일이면 딩동, 아니면 반짝
        if (right || milestone || justTitled) chime();
        sparkle();
        setConfetti(
          milestone
            ? r.streak >= 30
              ? 44
              : r.streak >= 7
                ? 34
                : 26
            : right
              ? 16
              : justTitled
                ? 34
                : 10,
        );
      }, SUSPENSE_MS);
    } catch (e) {
      setErr((e as Error).message);
      setChosen(null);
      setPicks([]);
    } finally {
      setBusy(false);
    }
  };

  const total = d.tally.total;
  const answered = d.mine !== null;
  const short = roomShortName({ slug, name });
  const kicker =
    q.kind === "trivia"
      ? "🧩 오늘의 1분 퀴즈 · 정답 맞히기"
      : q.kind === "type"
        ? "🧩 이번 주 1분 유형 테스트"
        : "🧩 오늘의 1분 퀴즈";
  const joined =
    total >= SHOW_COUNT_MIN
      ? `오늘 ${total.toLocaleString("ko-KR")}명 참여`
      : null;

  // 공유 카드: 정답·보기는 빼고 내 결과만 (스포일러 X)
  const shareText = () => {
    const streak = d.streak > 0 ? ` · 🔥 ${d.streak}일` : "";
    if (q.kind === "trivia") {
      const ok = d.mine === String(q.answer);
      return `🧩 오늘의 ${short} 퀴즈 · 나는 ${ok ? "✅" : "❌"} (정답률 ${pct(d.tally.counts[String(q.answer)] ?? 0, total)}%)${streak}`;
    }
    if (q.kind === "type")
      return `🧩 ${short}방 유형 테스트 · 나는 ${q.results[d.mine!]?.name ?? ""}${streak}`;
    return `🧩 오늘의 ${short} 퀴즈 · 나랑 같은 선택 ${pct(d.tally.counts[d.mine!] ?? 0, total)}%${streak}`;
  };
  const share = async () => {
    const url = `${window.location.origin}/c/${encodeURIComponent(slug)}`;
    try {
      if (navigator.share)
        await navigator.share({
          title: `오늘의 ${short} 퀴즈`,
          text: shareText(),
          url,
        });
      else {
        await navigator.clipboard.writeText(`${shareText()}\n${url}`);
        setCopied(true);
      }
    } catch {}
  };

  return (
    <section ref={ref} className="quiz-card" aria-label="오늘의 1분 퀴즈">
      <Confetti size={confetti} />
      <div className="quiz-top">
        <span className="quiz-kicker">{kicker}</span>
        <StreakChip me={d} />
      </div>

      {q.kind === "type" && answered && revealed ? (
        <div className="quiz-result">
          <span className="quiz-result-kicker">이 방에서 나는</span>
          <b>{q.results[d.mine!]?.name ?? "결과"}</b>
          <p>{q.results[d.mine!]?.line}</p>
          <p className="hint">
            같은 유형 {pct(d.tally.counts[d.mine!] ?? 0, total)}%
          </p>
        </div>
      ) : q.kind === "type" ? (
        <>
          <h2 className="quiz-q">
            {q.questions[Math.min(picks.length, q.questions.length - 1)]!.q}
          </h2>
          <p className="quiz-count">
            {q.title} · {Math.min(picks.length + 1, q.questions.length)}/
            {q.questions.length}
            {joined ? ` · ${joined}` : ""}
          </p>
          <div className="quiz-options">
            {q.questions[
              Math.min(picks.length, q.questions.length - 1)
            ]!.options.map((o, i) => (
              <button
                key={o.label}
                type="button"
                className="quiz-opt"
                disabled={busy || answered}
                onClick={(e) => {
                  pressFx(e);
                  softTap();
                  const next = [...picks, i];
                  setPicks(next);
                  if (next.length === q.questions.length)
                    void send({ picks: next });
                }}
              >
                <span className="quiz-label">{o.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2 className="quiz-q">{q.q}</h2>
          {joined && <p className="quiz-count">{joined}</p>}
          {!answered && (
            <p className="quiz-tease">
              {q.kind === "trivia"
                ? "맞히면 정답률이 보여요"
                : "누르면 나랑 같은 사람이 몇 %인지 보여요"}
            </p>
          )}
          <div className="quiz-options">
            {order.map((i) => {
              const o = q.options[i]!;
              const n = d.tally.counts[String(i)] ?? 0;
              const mineHere =
                d.mine === String(i) || (!answered && chosen === i);
              const correct = q.kind === "trivia" && revealed && i === q.answer;
              const wrongMine =
                q.kind === "trivia" && revealed && mineHere && i !== q.answer;
              return (
                <button
                  key={o}
                  type="button"
                  className={`quiz-opt${answered ? " done" : ""}${mineHere ? " mine" : ""}${correct ? " correct" : ""}${wrongMine ? " wrong" : ""}`}
                  disabled={busy || answered}
                  onClick={(e) => {
                    pressFx(e, 10);
                    softTap();
                    setChosen(i);
                    void send({ choice: i });
                  }}
                  aria-pressed={mineHere}
                >
                  {revealed && (
                    <span
                      className="quiz-bar"
                      style={{ width: `${pct(n, total)}%` }}
                    />
                  )}
                  <span className="quiz-label">
                    {correct ? "✅ " : wrongMine ? "❌ " : mineHere ? "✓ " : ""}
                    {o}
                  </span>
                  {revealed && (
                    <span className="quiz-pct">{pct(n, total)}%</span>
                  )}
                </button>
              );
            })}
          </div>
          {revealed && q.kind === "pick" && (
            <p className="quiz-reward">
              나와 같은 선택 {pct(d.tally.counts[d.mine!] ?? 0, total)}%
            </p>
          )}
          {revealed && q.kind === "trivia" && (
            <div className="quiz-reward">
              <b>
                {d.mine === String(q.answer)
                  ? "✅ 정답!"
                  : `정답은 "${q.options[q.answer]}"`}
              </b>{" "}
              · 정답률 {pct(d.tally.counts[String(q.answer)] ?? 0, total)}%
              <p className="hint">
                {q.why}{" "}
                <a
                  href={q.source}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                >
                  출처
                </a>
              </p>
            </div>
          )}
        </>
      )}

      {answered && revealed && (
        <>
          {plusOne && (
            <p className="quiz-note-line">🃏 +1 · 내 카드 모음에 담았어요</p>
          )}
          <p className="quiz-progress-label">
            {d.progress === TITLE_MIN
              ? `🎉 ${roomEmoji(slug)} ${short} 박사 칭호를 받았어요!`
              : d.progress > TITLE_MIN
                ? `${roomEmoji(slug)} ${short} 박사 🎓 · 카드 ${d.progress}장`
                : `${roomEmoji(slug)} ${short} 카드 ${d.progress}장`}
          </p>
          <button type="button" className="quiz-share" onClick={share}>
            {copied ? "✓ 복사했어요" : "📤 내 결과 공유하기"}
          </button>
          <NextStep slug={slug} notes={d.notes.total} />
        </>
      )}
      {err && <p className="error">{err}</p>}
    </section>
  );
}
