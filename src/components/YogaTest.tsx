"use client";

import Link from "next/link";
import { useState } from "react";
import { yogaBragLine, yogaPick, type YogaAnswers, YOGA_INTRO_POST_ID } from "@/lib/yogaTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof YogaAnswers; q: string; options: { label: string; value: YogaAnswers[keyof YogaAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "sweat", q: "수업 끝나고 어떤 기분이 좋아요?", options: [{ label: "땀 흠뻑, 개운함", value: true }, { label: "차분함, 노곤함", value: false }] },
  { key: "group", q: "혼자 vs 같이?", options: [{ label: "그룹 수업이 좋아요", value: true }, { label: "혼자·개인 레슨", value: false }] },
  { key: "morning", q: "주로 언제 해요?", options: [{ label: "아침", value: true }, { label: "저녁·밤", value: false }] },
  { key: "gear", q: "요가복·매트 고르는 것도 재밌어요?", options: [{ label: "네, 팝업도 가요", value: true }, { label: "있는 걸로 충분", value: false }] },
];

/** 🧘 나는 어떤 요가·필라테스 타입? 1분 테스트 (10/21, 팬 테스트와 같은 틀) */
export function YogaTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<YogaAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🧘 요가·필라테스 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 수련 타입?" : q.q}</h1>
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

  const pick = yogaPick(answers as YogaAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 수련 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={YOGA_INTRO_POST_ID}
        line={yogaBragLine(pick)}
        prompt="🧘 다른 사람들은 어떤 타입일까? 결과와 요즘 하는 것 한 줄"
        placeholder="예) 기구 필라테스 주 2회 / 빈야사 입문"
      />
      <RoomPoll slug="요가-필라테스-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/요가-필라테스-덕후방" className="btn">
          🧘 요가·필라테스 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
