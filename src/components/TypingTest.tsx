"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { drawShareCard, shareOrDownload } from "@/lib/shareCard";
import {
  TYPING_BRAG_POST_ID,
  TYPING_MIN_PARTICIPANTS,
  TYPING_ROUNDS,
  TYPING_SENTENCES,
  cpm,
  scoreLine,
  typingBragLine,
  typingTier,
  type TypingDevice,
  type TypingStats,
} from "@/lib/typingTest";
import { QuickBrag } from "./QuickBrag";

type Result = { cpm: number; accuracy: number; device: TypingDevice } & TypingStats;
type Done = { strokes: number; correct: number; total: number; ms: number };

function pick(n: number): string[] {
  const a = [...TYPING_SENTENCES];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

/**
 * 한글 타자 테스트 (Sprint 67). 문장마다 첫 글자를 친 순간부터 엔터까지를 잰다.
 * 붙여넣기는 막고, 한글 조합 중의 엔터(IME)는 다음 문장으로 넘기지 않는다.
 */
export function TypingTest() {
  const [phase, setPhase] = useState<"intro" | "quiz" | "result">("intro");
  const [lines, setLines] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState<Done[]>([]);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [device, setDevice] = useState<TypingDevice>("pc");
  const started = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDevice(window.matchMedia?.("(pointer: coarse)").matches ? "mobile" : "pc");
  }, []);

  // 치는 동안 현재 타수를 보여 주려고 0.25초마다 다시 그린다
  useEffect(() => {
    if (phase !== "quiz") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "quiz") input.current?.focus();
  }, [phase, step]);

  const start = () => {
    setLines(pick(TYPING_ROUNDS));
    setStep(0);
    setTyped("");
    setDone([]);
    setResult(null);
    setError(null);
    setCopied(false);
    started.current = null;
    setPhase("quiz");
  };

  const next = async () => {
    if (!typed.trim() || started.current === null) return;
    const s = scoreLine(lines[step]!, typed);
    const all = [...done, { ...s, ms: Date.now() - started.current }];
    setDone(all);
    setTyped("");
    started.current = null;
    if (step + 1 < lines.length) {
      setStep(step + 1);
      return;
    }
    const strokes = all.reduce((n, d) => n + d.strokes, 0);
    const ms = all.reduce((n, d) => n + d.ms, 0);
    const correct = all.reduce((n, d) => n + d.correct, 0);
    const total = all.reduce((n, d) => n + d.total, 0);
    const speed = cpm(strokes, ms);
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    setResult({ cpm: speed, accuracy, device, participants: 0, topPercent: null, average: null, averageAccuracy: null });
    setPhase("result");
    try {
      setResult(await api<Result>("/api/typing-test", "POST", { cpm: speed, accuracy, device }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (phase === "intro") {
    return (
      <section className="ear-card">
        <p className="ear-kicker">⌨️ 1분 한글 타자 테스트</p>
        <h1 className="ear-title">
          나는 <em>몇 타</em>일까?
        </h1>
        <ul className="ear-how">
          <li>짧은 문장 {TYPING_ROUNDS}개를 보이는 그대로 치고 엔터를 누르세요.</li>
          <li>문장마다 첫 글자를 친 순간부터 시간을 재요. 틀린 글자는 타수에서 빠져요.</li>
          <li>휴대폰으로도 할 수 있어요. 기록은 PC와 휴대폰을 따로 비교해요.</li>
        </ul>
        <button type="button" className="btn btn-primary ear-start" onClick={start}>
          테스트 시작
        </button>
        <p className="hint ear-note">타수는 1분에 맞게 누른 자판 수예요 (두벌식 기준, 겹받침·겹모음은 두 번, 시프트는 세지 않음). 결과는 익명으로 참가자 통계에만 쓰여요.</p>
      </section>
    );
  }

  if (phase === "quiz") {
    const target = [...lines[step]!];
    const mine = [...typed];
    const live = started.current ? cpm(scoreLine(lines[step]!, typed).strokes, Math.max(1, now - started.current)) : 0;
    return (
      <section className="ear-card" aria-live="polite">
        <div className="ear-progress" aria-label={`${lines.length}문장 중 ${step + 1}번째`}>
          {lines.map((_, i) => (
            <span key={i} className={i < step ? "done" : i === step ? "now" : ""} />
          ))}
        </div>
        <p className="ear-kicker">
          {step + 1} / {lines.length} · 지금 {live}타
        </p>
        <p className="ty-target" aria-label={lines[step]}>
          {target.map((ch, i) => (
            <span key={i} className={i >= mine.length ? "" : mine[i] === ch ? "ok" : i === mine.length - 1 ? "now" : "bad"}>
              {ch}
            </span>
          ))}
        </p>
        <input
          ref={input}
          className="input ty-input"
          value={typed}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="위 문장을 그대로 입력"
          placeholder="여기에 그대로 치고 엔터"
          onPaste={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onChange={(e) => {
            if (started.current === null && e.target.value) started.current = Date.now();
            setTyped(e.target.value);
          }}
          onKeyDown={(e) => {
            // 한글 조합 중 엔터는 글자를 확정할 뿐 — 다음 문장으로 넘기지 않는다
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              void next();
            }
          }}
        />
        <button type="button" className="btn btn-primary ear-start" onClick={() => void next()} disabled={!typed.trim()}>
          {step + 1 < lines.length ? "다음 문장 (엔터)" : "결과 보기 (엔터)"}
        </button>
      </section>
    );
  }

  if (!result) return null;
  const tier = typingTier(result.cpm);
  const shareUrl = "https://nobangjang.com/typing-test?from=share";
  const deviceName = result.device === "mobile" ? "휴대폰" : "PC";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`한글 타자 ${result.cpm}타 · 정확도 ${result.accuracy}% ${tier.emoji} ${tier.name}! 너는 몇 타? → ${shareUrl}`);
      setCopied(true);
    } catch {
      setError("복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
    }
  };
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 타자 속도 ({deviceName})</p>
      <p className="ear-tier">
        <span aria-hidden>{tier.emoji}</span> {tier.name}
      </p>
      <p className="ear-score">
        <b>
          {result.cpm}타 · 정확도 {result.accuracy}%
        </b>
        {result.topPercent !== null && <> · {deviceName} 참가자 중 <b>상위 {result.topPercent}%</b></>}
      </p>
      <p className="hint">{tier.line}.</p>

      <QuickBrag
        postId={TYPING_BRAG_POST_ID}
        line={typingBragLine(result.cpm, result.accuracy, result.device)!}
        bragApi="/api/typing-test/brag"
        prompt="⌨️ 다른 사람은 몇 타? 기록과 쓰는 키보드 한 줄 남기기"
        placeholder="키보드·축 (예: 레오폴드 750R 갈축)"
      />

      {result.participants > 0 && (
        <p className="ear-stats">
          지금까지 {deviceName} <b>{result.participants}명</b> 참가 · 평균 {result.average}타 · 평균 정확도 {result.averageAccuracy}%
          {result.participants < TYPING_MIN_PARTICIPANTS && ` (참가자 ${TYPING_MIN_PARTICIPANTS}명부터 순위를 보여 드려요)`}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="ear-actions">
        <ShareCard speed={result.cpm} accuracy={result.accuracy} topPercent={result.topPercent} />
        <button type="button" className="btn" onClick={copy}>
          {copied ? "✅ 복사했어요" : "🔗 결과 링크 복사"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={start}>
          다시 하기
        </button>
      </div>
      <Link href="/c/keyboards" className="ear-cta">
        ⌨️ 키보드 방 구경하기: 다들 무슨 축 쓰는지 →
      </Link>
      <Link href="/daily" className="ear-cta" style={{ marginTop: 8 }}>
        📅 매일 0시 새 문제: 오늘의 문제 풀기 →
      </Link>
    </section>
  );
}

function ShareCard({ speed, accuracy, topPercent }: { speed: number; accuracy: number; topPercent: number | null }) {
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const tier = typingTier(speed);
      const blob = await drawShareCard({
        title: "🏠 노방장 한글 타자 테스트",
        sub: "짧은 문장 5개, 1분에 몇 타?",
        emoji: tier.emoji,
        name: tier.name,
        score: `${speed}타 · 정확도 ${accuracy}%`,
        extra: topPercent !== null ? `참가자 중 상위 ${topPercent}%` : null,
        url: "nobangjang.com/typing-test",
      });
      if (blob) await shareOrDownload(blob, "nobangjang-typing-test.png", `한글 타자 ${speed}타! 너도 해 봐 → https://nobangjang.com/typing-test?from=share`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn btn-primary" onClick={make} disabled={busy}>
      📸 결과 카드 저장·공유
    </button>
  );
}
