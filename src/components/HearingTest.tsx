"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import {
  HEARING_BRAG_POST_ID,
  HEARING_GAIN,
  HEARING_MIN_PARTICIPANTS,
  HEARING_STEPS,
  HEARING_TONE_SEC,
  hearingBragLine,
  hearingTier,
  type HearingStats,
} from "@/lib/hearingTest";
import { drawShareCard, shareOrDownload } from "@/lib/shareCard";
import { QuickBrag } from "./QuickBrag";

type Side = "A" | "B";
type Result = { maxKhz: number } & HearingStats;

/**
 * 고음 청력 테스트 (Sprint 61). 단계마다 A·B 중 한쪽에만 사인파를 넣고 소리 난 쪽을 고르게 한다.
 * 소리 없는 쪽도 같은 시간 동안 "재생 중"으로 보여서 화면으로는 구분할 수 없다.
 * 틀리거나 "둘 다 안 들려요"면 끝 — 결과는 마지막으로 맞힌 주파수.
 */
export function HearingTest() {
  const [phase, setPhase] = useState<"intro" | "quiz" | "result">("intro");
  const [step, setStep] = useState(0);
  const [toneSide, setToneSide] = useState<Side>("A");
  const [heard, setHeard] = useState<{ A: boolean; B: boolean }>({ A: false, B: false });
  const [playing, setPlaying] = useState<Side | "check" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  /** 사용자가 누른 순간에만 오디오를 켤 수 있다 (브라우저 자동 재생 정책) */
  const audio = () => {
    if (!ctx.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx.current = new AC();
    }
    void ctx.current.resume();
    return ctx.current;
  };

  /** freq 가 null 이면 소리 없이 같은 시간만 "재생" */
  const sound = (freq: number | null, who: Side | "check") => {
    stopRef.current?.();
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      setPlaying((p) => (p === who ? null : p));
    };
    let osc: OscillatorNode | null = null;
    if (freq !== null) {
      try {
        const ac = audio();
        const t = ac.currentTime;
        osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        // 딸깍 소리가 나지 않게 천천히 켜고 끈다 (딸깍 소리로 정답을 알 수 있으면 안 된다)
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(HEARING_GAIN, t + 0.08);
        gain.gain.setValueAtTime(HEARING_GAIN, t + HEARING_TONE_SEC - 0.08);
        gain.gain.linearRampToValueAtTime(0, t + HEARING_TONE_SEC);
        osc.connect(gain).connect(ac.destination);
        osc.start(t);
        osc.stop(t + HEARING_TONE_SEC + 0.02);
      } catch {
        setError("소리를 재생하지 못했어요. 다른 브라우저로 열어 주세요.");
        return;
      }
    } else {
      audio(); // 소리 없는 쪽도 같은 경로로 (오디오 장치가 켜지는 소리 차이가 없게)
    }
    const timer = setTimeout(finish, HEARING_TONE_SEC * 1000 + 50);
    stopRef.current = () => {
      clearTimeout(timer);
      try {
        osc?.stop();
      } catch {}
      finish();
    };
    setPlaying(who);
  };

  const start = () => {
    audio();
    setStep(0);
    setToneSide(Math.random() < 0.5 ? "A" : "B");
    setHeard({ A: false, B: false });
    setResult(null);
    setError(null);
    setCopied(false);
    setPhase("quiz");
  };

  const play = (side: Side) => {
    sound(side === toneSide ? HEARING_STEPS[step]! * 1000 : null, side);
    setHeard((h) => ({ ...h, [side]: true }));
  };

  const finish = async (maxKhz: number) => {
    stopRef.current?.();
    setResult({ maxKhz, participants: 0, topPercent: null, average: null, byKhz: [] });
    setPhase("result");
    try {
      setResult(await api<Result>("/api/hearing-test", "POST", { maxKhz }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const choose = (side: Side | null) => {
    const ok = side !== null && side === toneSide;
    if (!ok) return void finish(step === 0 ? 0 : HEARING_STEPS[step - 1]!);
    if (step + 1 >= HEARING_STEPS.length) return void finish(HEARING_STEPS[step]!);
    stopRef.current?.();
    setStep(step + 1);
    setToneSide(Math.random() < 0.5 ? "A" : "B");
    setHeard({ A: false, B: false });
  };

  if (phase === "intro") {
    return (
      <section className="ear-card">
        <p className="ear-kicker">🦟 1분 고음 청력 테스트</p>
        <h1 className="ear-title">
          당신 귀는 <em>몇 kHz</em>까지
          <br />
          들릴까?
        </h1>
        <ul className="ear-how">
          <li>A·B 중 한쪽에서만 높은 &ldquo;삐&rdquo; 소리가 나요. 둘 다 들어 보고 소리 난 쪽을 고르세요.</li>
          <li>8kHz에서 시작해 20kHz까지 점점 높아져요. 틀리거나 &ldquo;둘 다 안 들려요&rdquo;를 누르면 끝나요.</li>
          <li>나이가 들수록 높은 소리부터 안 들리게 된다고 알려져 있어요.</li>
        </ul>
        <div className="hear-safe">
          <b>🔉 먼저 볼륨을 맞춰 주세요</b>
          <p>아래 버튼의 소리(1kHz)가 편하게 들릴 만큼만. 높은 소리가 안 들린다고 볼륨을 올리지 마세요 — 귀에 무리가 갈 수 있어요.</p>
          <button type="button" className="btn" onClick={() => sound(1000, "check")} aria-pressed={playing === "check"}>
            {playing === "check" ? "🔊 소리 나는 중…" : "🔈 볼륨 맞추기 소리 듣기"}
          </button>
        </div>
        <button type="button" className="btn btn-primary ear-start" onClick={start}>
          테스트 시작
        </button>
        <p className="hint ear-note">
          청력 진단이 아니에요. 휴대폰·이어폰에 따라 높은 소리를 아예 못 내는 경우도 있어요. 이어폰을 끼고 조용한 곳에서 해 주세요. 결과는 익명으로 참가자 통계에만 쓰여요.
        </p>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  if (phase === "quiz") {
    const khz = HEARING_STEPS[step]!;
    const ready = heard.A && heard.B;
    return (
      <section className="ear-card" aria-live="polite">
        <div className="ear-progress" aria-label={`${HEARING_STEPS.length}단계 중 ${step + 1}번째`}>
          {HEARING_STEPS.map((_, i) => (
            <span key={i} className={i < step ? "done" : i === step ? "now" : ""} />
          ))}
        </div>
        <p className="ear-kicker">
          {step + 1} / {HEARING_STEPS.length} · {khz}kHz
        </p>
        <h2 className="ear-q">어느 쪽에서 소리가 났나요?</h2>
        <div className="ear-players">
          {(["A", "B"] as const).map((s) => (
            <button key={s} type="button" className={`ear-play${playing === s ? " on" : ""}`} onClick={() => play(s)} aria-pressed={playing === s} disabled={playing !== null && playing !== s}>
              <span className="ear-letter">{s}</span>
              <span>{playing === s ? "재생 중…" : heard[s] ? "↻ 다시 듣기" : "▶ 듣기"}</span>
            </button>
          ))}
        </div>
        {!ready && <p className="hint">A와 B를 모두 들어 보면 고를 수 있어요.</p>}
        {error && <p className="error">{error}</p>}
        <div className="ear-choices">
          {(["A", "B"] as const).map((s) => (
            <button key={s} type="button" className="btn ear-choice" disabled={!ready} onClick={() => choose(s)}>
              {s}에서 났어요
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost hear-none" disabled={!ready} onClick={() => choose(null)}>
          둘 다 안 들려요
        </button>
      </section>
    );
  }

  if (!result) return null;
  const tier = hearingTier(result.maxKhz);
  const shareUrl = "https://nobangjang.com/hearing-test?from=share";
  const scoreText = result.maxKhz ? `${result.maxKhz}kHz까지 들려요` : "8kHz도 안 들렸어요";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`내 귀는 ${tier.emoji} ${tier.name}! ${scoreText} 🦟 너는 몇 kHz까지 들려? → ${shareUrl}`);
      setCopied(true);
    } catch {
      setError("복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
    }
  };
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 고음 청력</p>
      <p className="ear-tier">
        <span aria-hidden>{tier.emoji}</span> {tier.name}
      </p>
      <p className="ear-score">
        <b>{scoreText}</b>
        {result.topPercent !== null && <> · 참가자 중 <b>상위 {result.topPercent}%</b></>}
      </p>
      <p className="hint">{tier.line}. 기기·이어폰에 따라 달라질 수 있는 참고 결과예요.</p>

      <QuickBrag
        postId={HEARING_BRAG_POST_ID}
        line={hearingBragLine(String(result.maxKhz))!}
        bragApi="/api/hearing-test/brag"
        prompt="👀 다른 사람은 몇 kHz? 내 결과도 한 줄 남기기"
        placeholder="나이대·이어폰 (예: 30대 / 버즈 프로)"
      />

      {result.participants > 0 && (
        <div className="ear-stats">
          <p>
            지금까지 <b>{result.participants}명</b> 참가 · 평균 {result.average}kHz
            {result.participants < HEARING_MIN_PARTICIPANTS && ` (참가자 ${HEARING_MIN_PARTICIPANTS}명부터 순위를 보여 드려요)`}
          </p>
          {result.byKhz.length > 0 && (
            <p className="hint">
              들은 사람 비율: {result.byKhz.filter((b) => b.khz >= 12).map((b) => `${b.khz}kHz ${Math.round(b.rate * 100)}%`).join(" · ")}
            </p>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="ear-actions">
        <ShareCard maxKhz={result.maxKhz} topPercent={result.topPercent} />
        <button type="button" className="btn" onClick={copy}>
          {copied ? "✅ 복사했어요" : "🔗 결과 링크 복사"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={start}>
          다시 하기
        </button>
      </div>
      <Link href="/ear-test" className="ear-cta">
        🎧 다음 도전: 원본 vs MP3 압축본, 구분되나요? (황금귀 테스트) →
      </Link>
    </section>
  );
}

function ShareCard({ maxKhz, topPercent }: { maxKhz: number; topPercent: number | null }) {
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const tier = hearingTier(maxKhz);
      const blob = await drawShareCard({
        title: "🏠 노방장 고음 청력 테스트",
        sub: "몇 kHz까지 들리나요? 8→20kHz",
        emoji: tier.emoji,
        name: tier.name,
        score: maxKhz ? `${maxKhz}kHz까지 들림` : "8kHz도 안 들림",
        extra: topPercent !== null ? `참가자 중 상위 ${topPercent}%` : null,
        url: "nobangjang.com/hearing-test",
      });
      if (blob) await shareOrDownload(blob, "nobangjang-hearing-test.png", `내 귀는 ${tier.name}! 너도 해 봐 → https://nobangjang.com/hearing-test?from=share`);
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
