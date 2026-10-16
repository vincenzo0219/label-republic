"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { BOOK_ROOM_SLUG } from "@/lib/books";
import { enablePush, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { dailyShareLine, streakOf, type DailyKind, type DailySet, type DailyToday } from "@/lib/daily";

type Side = "A" | "B";
type Saved = { days: string[]; answers: Record<string, Partial<Record<DailyKind, boolean>>> };
const KEY = "lr:daily";

function load(): Saved {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (v && Array.isArray(v.days) && v.answers) return v;
  } catch {}
  return { days: [], answers: {} };
}

function shuffled<T>(xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * 📅 오늘의 문제 (Sprint 66). 첫 문장 한 문제 + 황금귀 한 문제. 푼 기록과 연속 일수는 이 브라우저에만 저장하고,
 * 서버에는 그날 정답 여부만 익명으로 보내 "오늘 ○명 · 정답률 ○%"를 보여 준다.
 */
export function DailyChallenge({ set }: { set: DailySet }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [stats, setStats] = useState<DailyToday | null>(null);
  const [linePick, setLinePick] = useState<string | null>(null);
  const [heard, setHeard] = useState<{ A: boolean; B: boolean }>({ A: false, B: false });
  const [playing, setPlaying] = useState<Side | null>(null);
  const [earPick, setEarPick] = useState<Side | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = useMemo(() => shuffled([set.line.answer, ...set.line.others]), [set.line]);
  // 원본이 A인지는 그날 처음 열 때 정한다
  const origIsA = useMemo(() => Math.random() < 0.5, []);
  const audio = useRef<{ A?: HTMLAudioElement; B?: HTMLAudioElement }>({});

  useEffect(() => {
    setSaved(load());
    api<DailyToday>("/api/daily", "GET").then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    const srcs = origIsA ? { A: set.ear.orig, B: set.ear.comp } : { A: set.ear.comp, B: set.ear.orig };
    for (const s of ["A", "B"] as const) {
      const a = new Audio(srcs[s]);
      a.preload = "auto";
      a.onended = () => setPlaying((p) => (p === s ? null : p));
      audio.current[s] = a;
    }
    return () => {
      audio.current.A?.pause();
      audio.current.B?.pause();
    };
  }, [origIsA, set.ear]);

  if (!saved) return <section className="ear-card" aria-busy="true" />;
  const today = saved.answers[set.day] ?? {};

  const record = async (kind: DailyKind, correct: boolean) => {
    const next: Saved = {
      days: saved.days.includes(set.day) ? saved.days : [...saved.days, set.day].slice(-400),
      answers: { ...saved.answers, [set.day]: { ...today, [kind]: correct } },
    };
    // 오래된 날짜의 답은 지운다 (연속 기록은 days 로 센다)
    for (const d of Object.keys(next.answers)) if (d < set.day && Object.keys(next.answers).length > 30) delete next.answers[d];
    setSaved(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    try {
      setStats(await api<DailyToday>("/api/daily", "POST", { kind, correct }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const play = (s: Side) => {
    const other = s === "A" ? "B" : "A";
    audio.current[other]?.pause();
    const a = audio.current[s];
    if (!a) return;
    a.currentTime = 0;
    a.play().then(
      () => setPlaying(s),
      () => setError("소리를 재생하지 못했어요. 무음 모드를 끄고 다시 눌러 주세요."),
    );
    setHeard((h) => ({ ...h, [s]: true }));
  };

  const streak = streakOf(saved.days, set.day);
  const lineDone = today.line !== undefined;
  const earDone = today.ear !== undefined;
  const rate = (r: number | null | undefined) => (r == null ? "" : ` · 정답률 ${Math.round(r * 100)}%`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${dailyShareLine(set.no, Boolean(today.line), Boolean(today.ear), streak)}\nnobangjang.com/daily?from=share`);
      setCopied(true);
    } catch {
      setError("복사하지 못했어요.");
    }
  };

  return (
    <section className="ear-card daily">
      <p className="ear-kicker">
        📅 오늘의 문제 #{set.no} · {set.day.slice(5).replace("-", "/")}
        {streak > 0 && <span className="daily-streak"> 🔥 {streak}일 연속</span>}
      </p>
      <h1 className="ear-title">
        하루 두 문제, <em>매일 0시</em>에 새로 열려요
      </h1>

      <div className="daily-q">
        <p className="daily-label">📜 첫 문장 — 무슨 책일까요?</p>
        <blockquote className="fl-line">{set.line.line}</blockquote>
        <div className="fl-choices">
          {choices.map((t) => {
            const pickedT = lineDone ? (today.line ? set.line.answer : linePick) : linePick;
            return (
              <button
                key={t}
                type="button"
                className={`btn fl-choice${lineDone && t === set.line.answer ? " right" : ""}${lineDone && pickedT === t && !today.line ? " wrong" : ""}`}
                disabled={lineDone}
                onClick={() => {
                  setLinePick(t);
                  void record("line", t === set.line.answer);
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
        {lineDone && (
          <p className="fl-reveal-line" role="status">
            {today.line ? "⭕ 정답!" : "❌ 아쉬워요."} <b>{set.line.answer}</b> — {set.line.author}
            <span className="hint">
              {" "}
              {stats && stats.line.participants > 0 && `오늘 ${stats.line.participants}명${rate(stats.line.rate)}`}
            </span>
          </p>
        )}
      </div>

      <div className="daily-q">
        <p className="daily-label">🎧 황금귀 — 원본은 어느 쪽? ({set.ear.kbps}kbps 압축본과 비교)</p>
        <div className="ear-players">
          {(["A", "B"] as const).map((s) => (
            <button key={s} type="button" className={`ear-play${playing === s ? " on" : ""}`} onClick={() => play(s)} aria-pressed={playing === s}>
              <span className="ear-letter">{s}</span>
              <span>{playing === s ? "재생 중…" : heard[s] ? "↻ 다시 듣기" : "▶ 듣기"}</span>
            </button>
          ))}
        </div>
        <div className="ear-choices">
          {(["A", "B"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="btn ear-choice"
              disabled={earDone || !(heard.A && heard.B)}
              onClick={() => {
                setEarPick(s);
                void record("ear", (s === "A") === origIsA);
              }}
            >
              {s}가 원본
            </button>
          ))}
        </div>
        {!earDone && !(heard.A && heard.B) && <p className="hint">이어폰을 끼고 A와 B를 모두 들어 보면 고를 수 있어요.</p>}
        {earDone && (
          <p className="fl-reveal-line" role="status">
            {today.ear ? "⭕ 정답!" : "❌ 아쉬워요."} {earPick ? `원본은 ${origIsA ? "A" : "B"}였어요.` : ""}
            <span className="hint">
              {" "}
              {stats && stats.ear.participants > 0 && `오늘 ${stats.ear.participants}명${rate(stats.ear.rate)}`}
            </span>
          </p>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {lineDone && earDone && (
        <div className="daily-done">
          <p className="daily-share">{dailyShareLine(set.no, Boolean(today.line), Boolean(today.ear), streak)}</p>
          <p className="hint">
            {streak > 1 ? `🔥 ${streak}일째 이어 가는 중이에요. 내일 0시에 새 문제가 열려요 — 하루 거르면 다시 1일부터!` : "내일 0시에 새 문제가 열려요. 내일도 풀면 🔥 연속 기록이 시작돼요."}
          </p>
          <div className="ear-actions">
            <button type="button" className="btn btn-primary" onClick={copy}>
              {copied ? "✅ 복사했어요" : "🔗 결과 한 줄 복사 (정답은 안 보여요)"}
            </button>
            <DailyPush />
          </div>
          <Link href="/first-line-test" className="ear-cta">
            📜 더 풀고 싶다면: 첫 문장 테스트 10문제 →
          </Link>
          <Link href={`/c/${encodeURIComponent(BOOK_ROOM_SLUG)}`} className="ear-cta" style={{ marginTop: 8 }}>
            📚 오늘의 책 얘기는 책방에서 →
          </Link>
        </div>
      )}
    </section>
  );
}

const PUSH_KEY = "lr:dailyPush";

/** 🔔 내일 문제 알림 (Sprint 70). 푸시를 못 쓰는 브라우저·서버면 인스타 팔로우 */
function DailyPush() {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(PUSH_KEY) === "1" && Notification.permission === "granted");
    } catch {}
    if (!pushSupported()) return setKey(null);
    void pushPublicKey().then(setKey);
  }, []);

  if (key === undefined) return null;
  if (key === null) {
    return (
      <a className="btn" href="https://www.instagram.com/nobangjang/" target="_blank" rel="noopener noreferrer">
        📷 매일 알림: 인스타 팔로우
      </a>
    );
  }
  if (on) return <span className="btn" aria-disabled="true">🔔 내일 아침 알려 드릴게요</span>;
  const enable = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await enablePush(key, true);
      if (r === "on") {
        setOn(true);
        try {
          window.localStorage.setItem(PUSH_KEY, "1");
        } catch {}
      } else if (r === "denied") setMsg("브라우저 설정에서 알림을 허용해 주세요.");
    } catch {
      setMsg("알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn" onClick={enable} disabled={busy}>
        🔔 내일 문제 알림 받기
      </button>
      {msg && <p className="hint">{msg}</p>}
    </>
  );
}
