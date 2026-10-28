"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { SINGLES_PATH } from "@/lib/singlesEvents";
import { SIM_HIGH, SIM_MIN_PARTICIPANTS, SIM_SCENES, SIM_TYPES, type SimStats, type SimType } from "@/lib/someSim";

const TYPING_MS = 900;
const LIMIT_S = 3;

type Result = { anx: number; avo: number; type: SimType } & SimStats;

/** 💬 썸 시뮬레이터: 카톡 같은 화면에서 답장을 고르면 썸 날씨(애착 4유형)가 나온다. 솔로가 다음 썸을 미리 해 보는 것 (10/28 대표님 "아직 미혼이고 솔로잖아") (10/28) */
export function SomeSim() {
  const [step, setStep] = useState(-1); // -1 시작 화면, 0~7 장면, 8 결과
  const [picks, setPicks] = useState<number[]>([]);
  const [waits, setWaits] = useState<number[]>([]);
  const [typing, setTyping] = useState(false);
  const [left, setLeft] = useState(LIMIT_S);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const shownAt = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  // 상대가 "입력 중…" 뒤에 말풍선을 보내고, 그때부터 3초 타이머
  useEffect(() => {
    if (step < 0 || step >= SIM_SCENES.length) return;
    setTyping(true);
    const t = setTimeout(() => {
      setTyping(false);
      shownAt.current = Date.now();
      setLeft(LIMIT_S);
    }, SIM_SCENES[step]!.them ? TYPING_MS : 300);
    return () => clearTimeout(t);
  }, [step]);
  useEffect(() => {
    if (typing || step < 0 || step >= SIM_SCENES.length || left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, typing, step]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [step, typing]);

  const pick = async (i: number) => {
    const nextPicks = [...picks, i];
    setPicks(nextPicks);
    setWaits([...waits, Date.now() - shownAt.current]);
    if (nextPicks.length < SIM_SCENES.length) {
      // 다음 장면 답장 버튼이 "입력 중…" 전에 잠깐 보이지 않게 (고민 시간도 말풍선이 뜬 뒤부터 잰다)
      setTyping(true);
      return setStep(step + 1);
    }
    setStep(SIM_SCENES.length);
    try {
      setResult(await api<Result>("/api/some-sim", "POST", { picks: nextPicks }));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (step < 0)
    return (
      <div className="sim">
        <header className="sim-hero">
          <p className="sim-kicker">💌 미혼남녀 만남 행사방</p>
          <h1>💬 썸 시뮬레이터</h1>
          <p>솔로인 지금, 다음 소개팅이 잡혔다고 상상해 보세요. 소개팅 다음 날부터 3일간의 카톡, 답장만 고르면 당신의 <b>썸 날씨</b>가 나와요.</p>
          <p className="hint">답장마다 3초 타이머가 돌아요. 오래 고민한 장면도 결과에 나와요.</p>
        </header>
        <button type="button" className="btn btn-primary sim-start" onClick={() => { setTyping(true); setStep(0); }}>
          카톡 열기
        </button>
        <p className="hint sim-note">성인 애착 이론(Bartholomew &amp; Horowitz, 1991)을 참고한 재미용 테스트예요. 진단이 아니에요. 가입 없이, 결과는 익명으로 유형만 저장돼요.</p>
      </div>
    );

  if (step >= SIM_SCENES.length) return <SimResult result={result} err={err} waits={waits} onRetry={() => { setPicks([]); setWaits([]); setResult(null); setErr(null); setStep(0); }} />;

  const scene = SIM_SCENES[step]!;
  const prevDay = step > 0 ? SIM_SCENES[step - 1]!.day : 0;
  return (
    <div className="sim">
      <div className="sim-phone">
        <div className="sim-top">
          <b>소개팅 그 사람</b>
          <span className="hint">{step + 1} / {SIM_SCENES.length}</span>
        </div>
        <div className="sim-chat" aria-live="polite">
          {scene.day !== prevDay && <p className="sim-day">{scene.day}일차</p>}
          <p className="sim-time">{scene.time}</p>
          {scene.note && <p className="sim-situation">{scene.note}</p>}
          {typing ? (
            scene.them && <p className="sim-bubble them sim-typing">입력 중…</p>
          ) : (
            scene.them?.map((m) => (
              <p key={m} className="sim-bubble them">
                {m}
              </p>
            ))
          )}
          <div ref={bottom} />
        </div>
        {!typing && (
          <div className="sim-replies">
            <p className={`sim-timer${left <= 0 ? " late" : ""}`}>{left > 0 ? `⏱ ${left}초` : "⏱ 고민 중…"}</p>
            {scene.choices.map((c, i) => (
              <button key={c.text} type="button" className="sim-reply" onClick={() => pick(i)}>
                {c.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SimResult({ result, err, waits, onRetry }: { result: Result | null; err: string | null; waits: number[]; onRetry: () => void }) {
  if (err)
    return (
      <div className="sim">
        <p className="hint">{err}</p>
        <button type="button" className="btn" onClick={onRetry}>
          다시 하기
        </button>
      </div>
    );
  if (!result) return <p className="hint sim">결과를 계산하는 중…</p>;
  const t = SIM_TYPES[result.type];
  const slow = waits.length ? waits.indexOf(Math.max(...waits)) : -1;
  const slowS = slow >= 0 ? Math.round(waits[slow]! / 100) / 10 : 0;
  const max = 16;
  const share = async () => {
    const url = `${window.location.origin}/some-sim`;
    const text = `다음 썸에서 내 날씨는 ${t.emoji} ${t.name}! 너는 무슨 날씨야?`;
    try {
      if (navigator.share) return await navigator.share({ title: "💬 썸 시뮬레이터", text, url });
      await navigator.clipboard.writeText(`${text}\n${url}`);
      alert("링크를 복사했어요.");
    } catch {}
  };
  return (
    <div className="sim">
      <div className={`sim-result sim-${result.type}`}>
        <p className="sim-kicker">다음 썸에서 당신의 날씨</p>
        <h1>
          {t.emoji} {t.name}
        </h1>
        <p className="hint">애착 이론으로는 {t.std}</p>
        <p className="sim-line">{t.line}</p>
        <dl className="sim-pros">
          <dt>💪 강점</dt>
          <dd>{t.strength}</dd>
          <dt>⚠️ 조심</dt>
          <dd>{t.watch}</dd>
        </dl>
      </div>

      {slow >= 0 && slowS >= 2 && (
        <p className="sim-slow">
          ⏱ <b>{SIM_SCENES[slow]!.label}</b> {slowS}초 고민했어요. 이 장면이 당신의 마음 버튼이에요.
        </p>
      )}

      <div className="sim-map" aria-label={`불안 ${result.anx}점, 회피 ${result.avo}점`}>
        <span className="sim-axis-y">불안 ↑</span>
        <span className="sim-axis-x">회피 →</span>
        <span className="sim-q q-shower">🌧</span>
        <span className="sim-q q-storm">🌪</span>
        <span className="sim-q q-sunny">☀️</span>
        <span className="sim-q q-fog">🌫</span>
        <span className="sim-line-h" style={{ bottom: `${(SIM_HIGH / max) * 100}%` }} />
        <span className="sim-line-v" style={{ left: `${(SIM_HIGH / max) * 100}%` }} />
        <span className="sim-dot" style={{ left: `${(result.avo / max) * 100}%`, bottom: `${(result.anx / max) * 100}%` }} />
      </div>

      <p className="sim-chem">
        잘 맞는 날씨 {SIM_TYPES[t.good].emoji} {SIM_TYPES[t.good].name} · 부딪히기 쉬운 날씨 {SIM_TYPES[t.clash].emoji} {SIM_TYPES[t.clash].name}
      </p>

      {result.participants >= SIM_MIN_PARTICIPANTS && (
        <div className="sim-share">
          <p className="hint">지금까지 {result.participants.toLocaleString("ko-KR")}명의 날씨</p>
          {(Object.keys(SIM_TYPES) as SimType[]).map((k) => (
            <p key={k} className="sim-bar">
              <span>
                {SIM_TYPES[k].emoji} {SIM_TYPES[k].name}
              </span>
              <span className="sim-bar-track">
                <span style={{ width: `${result.share[k]}%` }} />
              </span>
              <span>{result.share[k]}%</span>
            </p>
          ))}
        </div>
      )}

      <div className="sim-actions">
        <button type="button" className="btn btn-primary" onClick={share}>
          친구 날씨도 물어보기
        </button>
        <button type="button" className="btn" onClick={onRetry}>
          다시 하기
        </button>
      </div>
      <p>
        <Link href={SINGLES_PATH} className="ear-banner">
          💌 진짜 만남은 여기서: 지자체 미혼남녀 만남 행사 모아 보기 →
        </Link>
      </p>
      <p className="hint sim-note">애착 유형은 경험에 따라 바뀔 수 있어요. 성인 애착 이론(Bartholomew &amp; Horowitz, 1991)을 참고한 재미용 테스트이고, 진단이 아니에요.</p>
    </div>
  );
}
