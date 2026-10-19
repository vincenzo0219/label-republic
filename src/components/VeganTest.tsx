"use client";

import Link from "next/link";
import { useState } from "react";
import { veganBragLine, veganPick, type VeganAnswers, VEGAN_INTRO_POST_ID } from "@/lib/veganTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof VeganAnswers; q: string; options: { label: string; value: VeganAnswers[keyof VeganAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "meat", q: "고기(소·돼지·닭)는?", options: [{ label: "가끔 먹어요", value: true }, { label: "안 먹어요", value: false }] },
  { key: "fish", q: "생선·해산물은?", options: [{ label: "먹어요", value: true }, { label: "안 먹어요", value: false }] },
  { key: "dairyEgg", q: "우유·치즈·달걀은?", options: [{ label: "먹어요", value: true }, { label: "안 먹어요", value: false }] },
  { key: "beyondFood", q: "옷·화장품도 동물성 원료를 피하나요?", options: [{ label: "네, 챙겨요", value: true }, { label: "먹는 것만 챙겨요", value: false }] },
];

/** 🌱 나는 어떤 채식 타입? 1분 테스트 (Sprint 88) */
export function VeganTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<VeganAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🌱 채식 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 채식 타입?" : q.q}</h1>
        {step === 0 && <p className="hint">{q.q}</p>}
        <div className="ear-choices" style={{ display: "grid", gap: 8 }}>
          {q.options.map((o) => (
            <button
              key={o.label}
              type="button"
              className="btn ear-choice"
              onClick={() => {
                setAnswers({ ...answers, [q.key]: o.value });
                setStep(step + 1);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const pick = veganPick(answers as VeganAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 채식 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={VEGAN_INTRO_POST_ID}
        line={veganBragLine(pick)}
        prompt="🌱 다른 사람들은 어떤 타입일까? 결과 한 줄 남기기"
        placeholder="예) 2년 차 / 요즘 두부 요리에 빠짐"
      />
      <RoomPoll slug="비건-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/비건-덕후방" className="btn">
          🌱 비건 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
