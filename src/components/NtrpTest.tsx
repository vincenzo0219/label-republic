"use client";

import Link from "next/link";
import { useState } from "react";
import { NTRP_QUESTIONS, ntrpBand, ntrpScore } from "@/lib/ntrpTest";
import { RoomPoll } from "./RoomPoll";

/** 🎾 NTRP 1분 자가진단 (10/28) */
export function NtrpTest() {
  const [picks, setPicks] = useState<number[]>([]);
  const step = picks.length;

  if (step < NTRP_QUESTIONS.length) {
    const q = NTRP_QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🎾 NTRP 1분 자가진단 · {step + 1}/{NTRP_QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "내 테니스 NTRP는?" : q.q}</h1>
        {step === 0 && <p className="hint">{q.q}</p>}
        <div className="ear-choices" style={{ display: "grid", gap: 8 }}>
          {q.options.map((o, i) => (
            <button key={o.label} type="button" className="btn ear-choice" onClick={() => setPicks([...picks, i])}>
              {o.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const band = ntrpBand(ntrpScore(picks) ?? 0);
  const share = async () => {
    const url = `${window.location.origin}/ntrp-test`;
    const text = `내 NTRP 자가진단은 ${band.level} (${band.name})! 너는 몇이야?`;
    try {
      if (navigator.share) return await navigator.share({ title: "🎾 NTRP 1분 자가진단", text, url });
      await navigator.clipboard.writeText(`${text}\n${url}`);
      alert("링크를 복사했어요.");
    } catch {}
  };
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 NTRP 자가진단</p>
      <p className="ear-tier">
        <span aria-hidden>🎾</span> {band.level} · {band.name}
      </p>
      <p>{band.what}</p>
      <p className="hint">👉 {band.next}</p>
      <RoomPoll slug="테니스-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-primary" onClick={share}>
          파트너 NTRP도 물어보기
        </button>
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
