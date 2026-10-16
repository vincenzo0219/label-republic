"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { AI_PAIRS, AI_TEST_BRAG_POST_ID, AI_TEST_MIN_PARTICIPANTS, AI_TEST_TOTAL, aiBragLine, aiTier, type AiStats } from "@/lib/aiTest";
import { drawShareCard, shareOrDownload } from "@/lib/shareCard";
import { QuickBrag } from "./QuickBrag";

type Result = { score: number } & AiStats;

/**
 * AI 판별 테스트 (Sprint 68). 문제마다 두 문장 중 하나는 진짜 시인, 하나는 AI가 흉내 낸 문장 — 진짜를 고른다.
 * 고르면 바로 출처와 "AI 문장을 알아보는 단서"를 보여 준다.
 */
export function AiTest() {
  const [phase, setPhase] = useState<"intro" | "quiz" | "result">("intro");
  const [step, setStep] = useState(0);
  const [mask, setMask] = useState(0);
  const [picked, setPicked] = useState<"A" | "B" | null>(null);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 사람 문장이 A인지는 문제마다 무작위
  const humanIsA = useMemo(() => AI_PAIRS.map(() => Math.random() < 0.5), [round]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const pick = (side: "A" | "B") => {
    if (picked) return;
    setPicked(side);
    if ((side === "A") === humanIsA[step]) setMask((m) => m | (1 << step));
  };

  const next = async () => {
    if (step + 1 < AI_TEST_TOTAL) {
      setStep(step + 1);
      setPicked(null);
      return;
    }
    let score = 0;
    for (let m = mask; m; m >>= 1) score += m & 1;
    setResult({ score, participants: 0, topPercent: null, average: null, byQuestion: [] });
    setPhase("result");
    try {
      setResult(await api<Result>("/api/ai-test", "POST", { mask }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (phase === "intro") {
    return (
      <section className="ear-card">
        <p className="ear-kicker">🤖 1분 AI 판별 테스트</p>
        <h1 className="ear-title">
          AI가 흉내 낸 문장,
          <br />
          <em>골라낼 수 있어요?</em>
        </h1>
        <ul className="ear-how">
          <li>문제마다 두 문장이 나와요. 하나는 진짜 시인이 쓴 문장, 하나는 AI가 같은 분위기로 새로 쓴 문장이에요.</li>
          <li>진짜(사람)를 고르세요. 고르면 바로 출처와 &ldquo;AI 문장을 알아보는 단서&rdquo;를 알려 드려요.</li>
          <li>
            <b>(어렵습니다.)</b> 아는 시라면 쉽고, 모르면 AI가 더 그럴듯해 보여요.
          </li>
        </ul>
        <button type="button" className="btn btn-primary ear-start" onClick={start}>
          테스트 시작
        </button>
        <p className="hint ear-note">사람 문장은 저작권이 끝난 한국 근대 시·소설의 실제 문장이고, AI 문장은 노방장의 AI가 이 테스트를 위해 새로 썼어요. 결과는 익명으로 참가자 통계에만 쓰여요.</p>
      </section>
    );
  }

  if (phase === "quiz") {
    const q = AI_PAIRS[step]!;
    const text = { A: humanIsA[step] ? q.human : q.ai, B: humanIsA[step] ? q.ai : q.human };
    const humanSide = humanIsA[step] ? "A" : "B";
    const right = picked === humanSide;
    return (
      <section className="ear-card" aria-live="polite">
        <div className="ear-progress" aria-label={`${AI_TEST_TOTAL}문제 중 ${step + 1}번째`}>
          {AI_PAIRS.map((_, i) => (
            <span key={i} className={i < step ? "done" : i === step ? "now" : ""} />
          ))}
        </div>
        <p className="ear-kicker">
          {step + 1} / {AI_TEST_TOTAL}
        </p>
        <h2 className="ear-q">진짜 사람이 쓴 문장은?</h2>
        <div className="ai-pair">
          {(["A", "B"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`ai-card${picked && s === humanSide ? " right" : ""}${picked === s && !right ? " wrong" : ""}`}
              onClick={() => pick(s)}
              disabled={picked !== null}
            >
              <span className="ai-letter">{s}</span>
              <span className="ai-text">{text[s].split(" / ").map((l, i) => <span key={i}>{l}</span>)}</span>
              {picked && <span className="ai-who">{s === humanSide ? `✍️ ${q.author} 「${q.work}」` : "🤖 AI가 쓴 문장"}</span>}
            </button>
          ))}
        </div>
        {picked && (
          <div className="fl-reveal" role="status">
            <p>
              {right ? "⭕ 정답!" : "❌ AI에 속았어요."} <span className="hint">💡 {q.tell}</span>
            </p>
            <button type="button" className="btn btn-primary ear-start" onClick={next}>
              {step + 1 < AI_TEST_TOTAL ? "다음 문제 →" : "결과 보기"}
            </button>
          </div>
        )}
      </section>
    );
  }

  if (!result) return null;
  const tier = aiTier(result.score);
  const shareUrl = "https://nobangjang.com/ai-test?from=share";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`AI가 흉내 낸 문장 골라내기 ${result.score}/${AI_TEST_TOTAL} ${tier.emoji} ${tier.name}! 너는 몇 개? → ${shareUrl}`);
      setCopied(true);
    } catch {
      setError("복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
    }
  };
  const hardest =
    result.byQuestion.length && result.participants >= AI_TEST_MIN_PARTICIPANTS ? result.byQuestion.reduce((lo, r, i) => (r < result.byQuestion[lo]! ? i : lo), 0) : null;
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 AI 판별력</p>
      <p className="ear-tier">
        <span aria-hidden>{tier.emoji}</span> {tier.name}
      </p>
      <p className="ear-score">
        <b>
          {AI_TEST_TOTAL}문제 중 {result.score}개 정답
        </b>
        {result.topPercent !== null && <> · 참가자 중 <b>상위 {result.topPercent}%</b></>}
      </p>
      <p className="hint">{tier.line}.</p>

      {AI_TEST_BRAG_POST_ID && (
        <QuickBrag
          postId={AI_TEST_BRAG_POST_ID}
          line={aiBragLine(result.score)!}
          bragApi="/api/ai-test/brag"
          prompt="🤖 다른 사람은 몇 개? 점수와 주로 쓰는 AI 한 줄 남기기"
          placeholder="주로 쓰는 AI (예: Claude, ChatGPT)"
        />
      )}

      {result.participants > 0 && (
        <div className="ear-stats">
          <p>
            지금까지 <b>{result.participants}명</b> 참가 · 평균 {result.average}개
            {result.participants < AI_TEST_MIN_PARTICIPANTS && ` (참가자 ${AI_TEST_MIN_PARTICIPANTS}명부터 순위를 보여 드려요)`}
          </p>
          {hardest !== null && (
            <p className="hint">
              가장 많이 속은 문제: {AI_PAIRS[hardest]!.author} 「{AI_PAIRS[hardest]!.work}」 (정답률 {Math.round(result.byQuestion[hardest]! * 100)}%)
            </p>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="ear-actions">
        <ShareCard score={result.score} topPercent={result.topPercent} />
        <button type="button" className="btn" onClick={copy}>
          {copied ? "✅ 복사했어요" : "🔗 결과 링크 복사"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={start}>
          다시 하기
        </button>
      </div>
      <Link href="/daily" className="ear-cta">
        📅 매일 0시 새 문제: 오늘의 문제 풀기 →
      </Link>
      <Link href="/first-line-test" className="ear-cta" style={{ marginTop: 8 }}>
        📜 첫 문장만 보고 무슨 책인지 알아요? 첫 문장 테스트 →
      </Link>
    </section>
  );
}

function ShareCard({ score, topPercent }: { score: number; topPercent: number | null }) {
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const tier = aiTier(score);
      const blob = await drawShareCard({
        title: "🏠 노방장 AI 판별 테스트",
        sub: "진짜 시인 vs AI, 진짜를 골라라",
        emoji: tier.emoji,
        name: tier.name,
        score: `${AI_TEST_TOTAL}문제 중 ${score}개 정답`,
        extra: topPercent !== null ? `참가자 중 상위 ${topPercent}%` : null,
        url: "nobangjang.com/ai-test",
      });
      if (blob) await shareOrDownload(blob, "nobangjang-ai-test.png", `AI 판별 테스트 ${score}/${AI_TEST_TOTAL}! 너도 해 봐 → https://nobangjang.com/ai-test?from=share`);
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
