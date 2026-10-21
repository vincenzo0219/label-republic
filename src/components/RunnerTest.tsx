"use client";

import Link from "next/link";
import { useState } from "react";
import { runnerBragLine, runnerPick, type RunnerAnswers, RUNNER_INTRO_POST_ID } from "@/lib/runnerTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof RunnerAnswers; q: string; options: { label: string; value: RunnerAnswers[keyof RunnerAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "dawn", q: "주로 언제 달려요?", options: [{ label: "새벽·아침", value: true }, { label: "퇴근 후·밤", value: false }] },
  { key: "crew", q: "혼자 vs 같이?", options: [{ label: "크루·친구랑", value: true }, { label: "혼자가 편해요", value: false }] },
  { key: "record", q: "페이스·기록 챙겨요?", options: [{ label: "네, 꼼꼼히", value: true }, { label: "기분 따라 달려요", value: false }] },
  { key: "race", q: "대회 나가 봤어요?", options: [{ label: "네, 메달 있어요", value: true }, { label: "아직이요", value: false }] },
];

/** 🏃 나는 어떤 러너? 1분 테스트 (10/21, 팬 테스트와 같은 틀) */
export function RunnerTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<RunnerAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🏃 러너 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 러너?" : q.q}</h1>
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

  const pick = runnerPick(answers as RunnerAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 러너 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={RUNNER_INTRO_POST_ID}
        line={runnerBragLine(pick)}
        prompt="🏃 다른 러너들은 어떤 타입일까? 결과와 주 코스 한 줄"
        placeholder="예) 반포 한강공원 / 주 3회 5km"
      />
      <RoomPoll slug="러닝-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/러닝-덕후방" className="btn">
          🏃 러닝 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
