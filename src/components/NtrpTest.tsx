"use client";

import Link from "next/link";
import { useState } from "react";
import { SCORE_TESTS } from "@/lib/friendLink";
import { NTRP_QUESTIONS, ntrpBand, ntrpScore } from "@/lib/ntrpTest";
import { RoomPoll } from "./RoomPoll";
import { Versus, VsIntro, useVs } from "./Versus";

const T = SCORE_TESTS.ntrp;

/** 🎾 NTRP 1분 자가진단 (10/28) */
export function NtrpTest() {
  const [picks, setPicks] = useState<number[]>([]);
  // 🎾 파트너 비교 링크(?vs=합계점수, 11/2): 시작 화면에 상대 등급, 끝나면 나란히
  const vs = useVs(T.max, T.min);
  const step = picks.length;

  if (step < NTRP_QUESTIONS.length) {
    const q = NTRP_QUESTIONS[step]!;
    return (
      <section className="ear-card">
        {step === 0 && <VsIntro vs={vs} format={T.format} />}
        <p className="ear-kicker">🎾 NTRP 1분 자가진단 · {step + 1}/{NTRP_QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "내 테니스 NTRP는?" : q.q}</h1>
        {step === 0 && <p className="hint">{q.q}</p>}
        <div className="ear-choices ear-long">
          {q.options.map((o, i) => (
            <button key={o.label} type="button" className="btn ear-choice" onClick={() => setPicks([...picks, i])}>
              {o.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const score = ntrpScore(picks) ?? T.min;
  const band = ntrpBand(score);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 NTRP 자가진단</p>
      <p className="ear-tier">
        <span aria-hidden>🎾</span> {band.level} · {band.name}
      </p>
      <p>{band.what}</p>
      <p className="hint">👉 {band.next}</p>
      <Versus vs={vs} mine={score} path={T.path} label={`🎾 NTRP 자가진단 (${band.name})`} format={T.format} rank={(n) => ntrpBand(n).min} cta="🎾 파트너에게 NTRP 비교 보내기" />
      <RoomPoll slug="테니스-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setPicks([])}>
          다시 하기
        </button>
        <Link href="/c/테니스-덕후방" className="btn">
          🎾 테니스방 가기
        </Link>
      </div>
      <p className="hint">USTA NTRP 등급 설명을 참고한 재미용 추정이에요. 공식 등급이 아니고, 대회 참가 자격은 대회 요강을 따라요.</p>
    </section>
  );
}
