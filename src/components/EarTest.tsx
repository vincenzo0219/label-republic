"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { drawShareCard, shareOrDownload } from "@/lib/shareCard";
import { EAR_BRAG_POST_ID, EAR_MIN_PARTICIPANTS, EAR_ROUNDS, EAR_TOTAL, earBragLine, earTier, type EarStats } from "@/lib/earTest";
import { QuickBrag } from "./QuickBrag";
import { Versus, VsIntro, useVs } from "./Versus";

type Side = "A" | "B";
type Result = { score: number } & EarStats;

/**
 * 황금귀 테스트 (Sprint 59). 문제마다 원본이 A인지 B인지 무작위로 섞고, 두 쪽을 다 들어 봐야 고를 수 있다.
 * 정답은 끝날 때까지 알려 주지 않는다 (중간에 알려 주면 귀가 아니라 요령으로 맞히게 된다).
 */
export function EarTest() {
  const vs = useVs(10);
  const [phase, setPhase] = useState<"intro" | "quiz" | "result">("intro");
  const [round, setRound] = useState(0);
  const [origIsA, setOrigIsA] = useState<boolean[]>([]);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [heard, setHeard] = useState<{ A: boolean; B: boolean }>({ A: false, B: false });
  const [playing, setPlaying] = useState<Side | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const audio = useRef<{ A?: HTMLAudioElement; B?: HTMLAudioElement }>({});

  const current = EAR_ROUNDS[round];
  const srcs = useMemo(() => {
    if (!current || origIsA.length === 0) return null;
    return origIsA[round] ? { A: current.orig, B: current.comp } : { A: current.comp, B: current.orig };
  }, [current, origIsA, round]);

  // 문제가 바뀌면 두 소리를 새로 불러오고, 다음 문제도 미리 받아 둔다
  useEffect(() => {
    if (phase !== "quiz" || !srcs) return;
    const make = (src: string, side: Side) => {
      const a = new Audio(src);
      a.preload = "auto";
      a.onended = () => setPlaying((p) => (p === side ? null : p));
      return a;
    };
    audio.current = { A: make(srcs.A, "A"), B: make(srcs.B, "B") };
    const next = EAR_ROUNDS[round + 1];
    const pre = next ? [new Audio(next.orig), new Audio(next.comp)] : [];
    pre.forEach((a) => (a.preload = "auto"));
    return () => {
      audio.current.A?.pause();
      audio.current.B?.pause();
    };
  }, [phase, srcs, round]);

  const start = () => {
    setOrigIsA(EAR_ROUNDS.map(() => Math.random() < 0.5));
    setAnswers([]);
    setRound(0);
    setHeard({ A: false, B: false });
    setResult(null);
    setError(null);
    setPhase("quiz");
  };

  const play = (side: Side) => {
    const me = audio.current[side];
    const other = audio.current[side === "A" ? "B" : "A"];
    if (!me) return;
    other?.pause();
    if (playing === side) {
      me.pause();
      setPlaying(null);
      return;
    }
    me.currentTime = 0;
    void me.play().catch(() => setError("소리를 재생하지 못했어요. 무음 모드를 끄고 다시 눌러 주세요."));
    setPlaying(side);
    setHeard((h) => ({ ...h, [side]: true }));
  };

  const choose = async (side: Side) => {
    audio.current.A?.pause();
    audio.current.B?.pause();
    setPlaying(null);
    const next = [...answers, (side === "A") === origIsA[round]];
    setAnswers(next);
    if (round + 1 < EAR_TOTAL) {
      setRound(round + 1);
      setHeard({ A: false, B: false });
      return;
    }
    const mask = next.reduce((m, ok, i) => (ok ? m | (1 << i) : m), 0);
    const local = next.filter(Boolean).length;
    setResult({ score: local, participants: 0, topPercent: null, average: null, byKbps: [] });
    setPhase("result");
    try {
      setResult(await api<Result>("/api/ear-test", "POST", { mask }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (phase === "intro") {
    return (
      <section className="ear-card">
        <VsIntro vs={vs} unit="개" />
        <p className="ear-kicker">🎧 1분 블라인드 테스트</p>
        <h1 className="ear-title">
          당신 귀는 <em>압축 음질</em>을
          <br />
          구분할 수 있을까?
        </h1>
        <ul className="ear-how">
          <li>같은 6초 구간을 A·B로 들려 드려요. 하나는 원본, 하나는 MP3 압축본이에요.</li>
          <li>둘 다 들어 보고 <b>원본</b>을 고르세요. 10문제, 뒤로 갈수록 압축이 덜 돼서 어려워요 (64→192kbps).</li>
          <li>정답은 끝나고 한꺼번에 알려 드려요.</li>
        </ul>
        <p className="hint">🎧 이어폰·헤드폰을 끼고 조용한 곳에서 해 주세요. 한 문제에 약 2MB씩 받아요(와이파이 권장).</p>
        <button type="button" className="btn btn-primary ear-start" onClick={start}>
          테스트 시작
        </button>
        <p className="hint ear-note">
          음원은 노방장이 직접 만든 곡이에요. 블루투스 코덱이 아니라 MP3 압축 음질을 비교하는 테스트예요. 결과는 익명으로 참가자 통계에만 쓰여요.
        </p>
      </section>
    );
  }

  if (phase === "quiz" && current) {
    const ready = heard.A && heard.B;
    return (
      <section className="ear-card" aria-live="polite">
        <div className="ear-progress" aria-label={`${EAR_TOTAL}문제 중 ${round + 1}번째`}>
          {EAR_ROUNDS.map((_, i) => (
            <span key={i} className={i < round ? "done" : i === round ? "now" : ""} />
          ))}
        </div>
        <p className="ear-kicker">
          {round + 1} / {EAR_TOTAL} · 압축본 {current.kbps}kbps
        </p>
        <h2 className="ear-q">어느 쪽이 원본일까요?</h2>
        <div className="ear-players">
          {(["A", "B"] as const).map((s) => (
            <button key={s} type="button" className={`ear-play${playing === s ? " on" : ""}`} onClick={() => play(s)} aria-pressed={playing === s}>
              <span className="ear-letter">{s}</span>
              <span>{playing === s ? "⏸ 멈춤" : heard[s] ? "↻ 다시 듣기" : "▶ 듣기"}</span>
            </button>
          ))}
        </div>
        {!ready && <p className="hint">A와 B를 모두 들어 보면 고를 수 있어요.</p>}
        {error && <p className="error">{error}</p>}
        <div className="ear-choices">
          {(["A", "B"] as const).map((s) => (
            <button key={s} type="button" className="btn ear-choice" disabled={!ready} onClick={() => choose(s)}>
              {s}가 원본
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (!result) return null;
  const tier = earTier(result.score);
  const shareUrl = "https://nobangjang.com/ear-test?from=share";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`나는 ${tier.emoji} ${tier.name}! 압축 음질 10문제 중 ${result.score}개 정답 🎧 너도 해 봐 → ${shareUrl}`);
      setCopied(true);
    } catch {
      setError("복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
    }
  };
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 귀 등급</p>
      <p className="ear-tier">
        <span aria-hidden>{tier.emoji}</span> {tier.name}
      </p>
      <p className="ear-score">
        10문제 중 <b>{result.score}개</b> 정답
        {result.topPercent !== null && <> · 참가자 중 <b>상위 {result.topPercent}%</b></>}
      </p>
      <p className="hint">{tier.line}. 찍어도 5개 안팎은 맞힐 수 있어요.</p>
      <Versus vs={vs} mine={result.score} unit="개" path="/ear-test" label="황금귀 테스트(원본 vs 압축 음원 10문제)" />
      {/* 테스트 → 커뮤니티 (Sprint 60·64): 결과 화면에서 바로 인증 댓글 */}
      <QuickBrag
        postId={EAR_BRAG_POST_ID}
        line={earBragLine(String(result.score))!}
        bragApi="/api/ear-test/brag"
        prompt="👀 다른 덕후들은 몇 개? 내 점수도 한 줄 남기기"
        placeholder="장비 (예: 아이폰 + 에어팟 프로)"
      />

      <table className="ear-table">
        <thead>
          <tr>
            <th>문제</th>
            <th>압축본</th>
            <th>내 답</th>
          </tr>
        </thead>
        <tbody>
          {EAR_ROUNDS.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{r.kbps}kbps</td>
              <td>{answers[i] ? "⭕ 정답" : "❌ 오답"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {result.participants > 0 && (
        <div className="ear-stats">
          <p>
            지금까지 <b>{result.participants}명</b> 참가 · 평균 {result.average}개
            {result.participants < EAR_MIN_PARTICIPANTS && ` (참가자 ${EAR_MIN_PARTICIPANTS}명부터 순위를 보여 드려요)`}
          </p>
          {result.byKbps.length > 0 && (
            <p className="hint">
              음질별 정답률: {result.byKbps.map((b) => `${b.kbps}kbps ${Math.round(b.rate * 100)}%`).join(" · ")}
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
      <Link href="/hearing-test" className="ear-cta">
        🦟 다음 도전: 내 귀는 몇 kHz까지 들릴까? (고음 청력 테스트) →
      </Link>
      <Link href="/posts/223" className="ear-cta">
        💬 덕후들의 코덱·음질 토론 보러 가기 →
      </Link>
    </section>
  );
}

/** 인스타 스토리 크기(1080×1920) 결과 카드를 그려서 저장·공유 */
function ShareCard({ score, topPercent }: { score: number; topPercent: number | null }) {
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const tier = earTier(score);
      const blob = await drawShareCard({
        title: "🏠 노방장 황금귀 테스트",
        sub: "압축 음질 블라인드 테스트 10문제",
        emoji: tier.emoji,
        name: tier.name,
        score: `10문제 중 ${score}개 정답`,
        extra: topPercent !== null ? `참가자 중 상위 ${topPercent}%` : null,
        url: "nobangjang.com/ear-test",
      });
      if (blob) await shareOrDownload(blob, "nobangjang-ear-test.png", `나는 ${tier.name}! 너도 해 봐 → https://nobangjang.com/ear-test?from=share`);
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
