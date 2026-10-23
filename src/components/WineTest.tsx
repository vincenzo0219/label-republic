"use client";

import Link from "next/link";
import { useState } from "react";
import { wineBragLine, winePick, type WineAnswers, WINE_INTRO_POST_ID } from "@/lib/wineTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof WineAnswers; q: string; options: { label: string; value: WineAnswers[keyof WineAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "red", q: "와인이라면?", options: [{ label: "레드", value: true }, { label: "화이트", value: false }] },
  { key: "heavy", q: "끌리는 바디감은?", options: [{ label: "묵직하게", value: true }, { label: "가볍고 산뜻하게", value: false }] },
  { key: "smoky", q: "위스키라면?", options: [{ label: "스모키한 피트", value: true }, { label: "달큰한 셰리", value: false }] },
  { key: "fruit", q: "더 좋은 향은?", options: [{ label: "상큼한 과일 향", value: true }, { label: "나무·흙 향", value: false }] },
  { key: "pairing", q: "곁들일 음식은?", options: [{ label: "하나하나 맞춰 봐요", value: true }, { label: "맛있으면 그만", value: false }] },
  { key: "label", q: "고를 때는?", options: [{ label: "라벨 읽고 공부", value: true }, { label: "느낌대로 직감", value: false }] },
];

const AGE = "만 19세 이상만 참여해 주세요.";

/** 🍷 나의 술 취향은? 1분 테스트 (10/23, 커피 테스트와 같은 틀) */
export function WineTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<WineAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🍷 술 취향 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나의 술 취향은?" : q.q}</h1>
        {step === 0 && <p className="hint"><b>🔞 {AGE}</b></p>}
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

  const pick = winePick(answers as WineAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 술 취향 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <p className="hint">🔞 {AGE}</p>
      <QuickBrag
        postId={WINE_INTRO_POST_ID}
        line={wineBragLine(pick)}
        prompt="🍷 다른 사람들은 어떤 취향일까? 결과와 좋아하는 맛 한 줄"
        placeholder="예) 상큼한 과일 향 / 치즈랑 맞춰 보는 게 재밌어요"
      />
      <RoomPoll slug="와인-위스키-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/와인-위스키-덕후방" className="btn">
          🍷 와인·위스키 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
