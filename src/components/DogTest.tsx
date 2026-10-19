"use client";

import Link from "next/link";
import { useState } from "react";
import { dogBragLine, dogPick, type DogAnswers, DOG_INTRO_POST_ID } from "@/lib/dogTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof DogAnswers; q: string; options: { label: string; value: DogAnswers[keyof DogAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "walkTwice", q: "산책은 하루에?", options: [{ label: "두 번 이상", value: true }, { label: "한 번 정도", value: false }] },
  { key: "labels", q: "사료·간식 성분표 봐요?", options: [{ label: "꼼꼼히 봐요", value: true }, { label: "브랜드만 봐요", value: false }] },
  { key: "travel", q: "카페·여행도 같이 가요?", options: [{ label: "자주 가요", value: true }, { label: "집이 좋아요", value: false }] },
  { key: "photos", q: "갤러리에 우리 개 사진이?", options: [{ label: "절반 이상", value: true }, { label: "가끔 찍어요", value: false }] },
];

/** 🐶 나는 어떤 견주? 1분 테스트 (Sprint 91) */
export function DogTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<DogAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🐶 견주 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 견주?" : q.q}</h1>
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

  const pick = dogPick(answers as DogAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 견주 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={DOG_INTRO_POST_ID}
        line={dogBragLine(pick)}
        prompt="🐶 다른 견주들은? 결과와 우리 개 한 줄"
        placeholder="예) 콩이 / 말티즈 / 5살"
      />
      <RoomPoll slug="반려견-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/반려견-덕후방" className="btn">
          🐶 반려견 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
