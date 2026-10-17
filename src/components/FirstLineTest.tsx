"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { BOOK_ROOM_SLUG } from "@/lib/books";
import {
  FIRST_LINE_BRAG_POST_ID,
  FIRST_LINE_MIN_PARTICIPANTS,
  FIRST_LINE_QUESTIONS,
  FIRST_LINE_TOTAL,
  firstLineBragLine,
  firstLineTier,
  type FirstLineStats,
} from "@/lib/firstLineTest";
import { drawShareCard, shareOrDownload } from "@/lib/shareCard";
import { ComeBack } from "./ComeBack";
import { QuickBrag } from "./QuickBrag";
import { Versus, VsIntro, useVs } from "./Versus";

type Result = { score: number } & FirstLineStats;

function shuffled<T>(xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * 첫 문장 테스트 (Sprint 65). 한 문제씩 첫 문장을 보여 주고 제목 네 개 중 하나를 고르게 한다.
 * 고르면 바로 정답과 작가를 보여 준다 — 틀려도 "이 책이었구나"를 알고 가게.
 */
export function FirstLineTest() {
  const vs = useVs(10);
  const [phase, setPhase] = useState<"intro" | "quiz" | "result">("intro");
  const [step, setStep] = useState(0);
  const [mask, setMask] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 보기 순서는 문제마다 섞되, 같은 문제 안에서는 고정
  const choices = useMemo(() => FIRST_LINE_QUESTIONS.map((q) => shuffled([q.answer, ...q.others])), [round]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    setRound((r) => r + 1);
    setStep(0);
    setMask(0);
    setPicked(null);
    setResult(null);
    setError(null);
    setCopied(false);
    setPhase("quiz");
  };

  const pick = (title: string) => {
    if (picked) return;
    setPicked(title);
    if (title === FIRST_LINE_QUESTIONS[step]!.answer) setMask((m) => m | (1 << step));
  };

  const next = async () => {
    if (step + 1 < FIRST_LINE_TOTAL) {
      setStep(step + 1);
      setPicked(null);
      return;
    }
    const finalMask = mask;
    let score = 0;
    for (let m = finalMask; m; m >>= 1) score += m & 1;
    setResult({ score, participants: 0, topPercent: null, average: null, byQuestion: [] });
    setPhase("result");
    try {
      setResult(await api<Result>("/api/first-line-test", "POST", { mask: finalMask }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (phase === "intro") {
    return (
      <section className="ear-card">
        <VsIntro vs={vs} unit="개" />
        <p className="ear-kicker">📜 1분 첫 문장 테스트</p>
        <h1 className="ear-title">
          첫 문장만 보고
          <br />
          <em>무슨 책</em>인지 알아요?
        </h1>
        <ul className="ear-how">
          <li>유명한 책 10권의 첫 문장이 하나씩 나와요. 제목 네 개 중 하나를 고르세요.</li>
          <li>뒤로 갈수록 어려워져요. 고르면 바로 정답과 작가를 알려 드려요.</li>
          <li>
            <b>(어렵습니다.)</b> 다 읽은 책이어도 첫 문장은 잘 기억나지 않거든요.
          </li>
        </ul>
        <button type="button" className="btn btn-primary ear-start" onClick={start}>
          테스트 시작
        </button>
        <p className="hint ear-note">저작권이 끝난 고전만 골랐어요. 외국 작품의 첫 문장은 노방장이 원문에서 직접 옮겼어요. 결과는 익명으로 참가자 통계에만 쓰여요.</p>
      </section>
    );
  }

  if (phase === "quiz") {
    const q = FIRST_LINE_QUESTIONS[step]!;
    const right = picked === q.answer;
    return (
      <section className="ear-card" aria-live="polite">
        <div className="ear-progress" aria-label={`${FIRST_LINE_TOTAL}문제 중 ${step + 1}번째`}>
          {FIRST_LINE_QUESTIONS.map((_, i) => (
            <span key={i} className={i < step ? "done" : i === step ? "now" : ""} />
          ))}
        </div>
        <p className="ear-kicker">
          {step + 1} / {FIRST_LINE_TOTAL}
        </p>
        <blockquote className="fl-line">{q.line}</blockquote>
        <h2 className="ear-q">이 첫 문장, 무슨 책일까요?</h2>
        <div className="fl-choices">
          {choices[step]!.map((t) => (
            <button
              key={t}
              type="button"
              className={`btn fl-choice${picked && t === q.answer ? " right" : ""}${picked === t && !right ? " wrong" : ""}`}
              onClick={() => pick(t)}
              disabled={picked !== null}
            >
              {t}
            </button>
          ))}
        </div>
        {picked && (
          <div className="fl-reveal" role="status">
            <p>
              {right ? "⭕ 정답!" : "❌ 아쉬워요."} <b>{q.answer}</b> — {q.author}
            </p>
            <button type="button" className="btn btn-primary ear-start" onClick={next}>
              {step + 1 < FIRST_LINE_TOTAL ? "다음 문제 →" : "결과 보기"}
            </button>
          </div>
        )}
      </section>
    );
  }

  if (!result) return null;
  const tier = firstLineTier(result.score);
  const shareUrl = "https://nobangjang.com/first-line-test?from=share";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`첫 문장만 보고 ${result.score}/${FIRST_LINE_TOTAL} 맞혔어요 ${tier.emoji} ${tier.name}! 너는 몇 권 알아봐? → ${shareUrl}`);
      setCopied(true);
    } catch {
      setError("복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
    }
  };
  // 정답률이 가장 낮은 문제 (참가자가 충분할 때만)
  const hardest =
    result.byQuestion.length && result.participants >= FIRST_LINE_MIN_PARTICIPANTS
      ? result.byQuestion.reduce((lo, r, i) => (r < result.byQuestion[lo]! ? i : lo), 0)
      : null;
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 첫 문장 감각</p>
      <p className="ear-tier">
        <span aria-hidden>{tier.emoji}</span> {tier.name}
      </p>
      <p className="ear-score">
        <b>
          {FIRST_LINE_TOTAL}문제 중 {result.score}개 정답
        </b>
        {result.topPercent !== null && <> · 참가자 중 <b>상위 {result.topPercent}%</b></>}
      </p>
      <p className="hint">{tier.line}.</p>
      <Versus vs={vs} mine={result.score} unit="개" path="/first-line-test" label="첫 문장 테스트(첫 문장만 보고 책 맞히기)" />

      <QuickBrag
        postId={FIRST_LINE_BRAG_POST_ID}
        line={firstLineBragLine(result.score)!}
        bragApi="/api/first-line-test/brag"
        prompt="📚 다른 독자는 몇 권? 점수와 요즘 읽는 책 한 줄 남기기"
        placeholder="요즘 읽는 책 (예: 미움받을 용기)"
      />
      <ComeBack poll />

      {result.participants > 0 && (
        <div className="ear-stats">
          <p>
            지금까지 <b>{result.participants}명</b> 참가 · 평균 {result.average}개
            {result.participants < FIRST_LINE_MIN_PARTICIPANTS && ` (참가자 ${FIRST_LINE_MIN_PARTICIPANTS}명부터 순위를 보여 드려요)`}
          </p>
          {hardest !== null && (
            <p className="hint">
              가장 어려웠던 문장: {FIRST_LINE_QUESTIONS[hardest]!.answer} (정답률 {Math.round(result.byQuestion[hardest]! * 100)}%)
            </p>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <details className="fl-review">
        <summary>정답 다시 보기</summary>
        <ol>
          {FIRST_LINE_QUESTIONS.map((q, i) => (
            <li key={q.answer}>
              {mask & (1 << i) ? "⭕" : "❌"} <b>{q.answer}</b> ({q.author}) — &ldquo;{q.line}&rdquo;
            </li>
          ))}
        </ol>
      </details>

      <div className="ear-actions">
        <ShareCard score={result.score} topPercent={result.topPercent} />
        <button type="button" className="btn" onClick={copy}>
          {copied ? "✅ 복사했어요" : "🔗 결과 링크 복사"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={start}>
          다시 하기
        </button>
      </div>
      <Link href={`/c/${encodeURIComponent(BOOK_ROOM_SLUG)}`} className="ear-cta">
        📚 책방 구경하기: 요즘 다들 뭐 읽는지, 한 줄씩 →
      </Link>
      <Link href="/books" className="ear-cta" style={{ marginTop: 8 }}>
        📖 이 책, 끝까지 읽을 만해요? 실제 독자 완독률 보기 →
      </Link>
    </section>
  );
}

function ShareCard({ score, topPercent }: { score: number; topPercent: number | null }) {
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const tier = firstLineTier(score);
      const blob = await drawShareCard({
        title: "🏠 노방장 첫 문장 테스트",
        sub: "첫 문장만 보고 무슨 책인지 맞히기",
        emoji: tier.emoji,
        name: tier.name,
        score: `${FIRST_LINE_TOTAL}문제 중 ${score}개 정답`,
        extra: topPercent !== null ? `참가자 중 상위 ${topPercent}%` : null,
        url: "nobangjang.com/first-line-test",
      });
      if (blob) await shareOrDownload(blob, "nobangjang-first-line-test.png", `첫 문장 테스트 ${score}/${FIRST_LINE_TOTAL}! 너도 해 봐 → https://nobangjang.com/first-line-test?from=share`);
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
