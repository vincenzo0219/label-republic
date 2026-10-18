"use client";

import Link from "next/link";
import { useState } from "react";
import { vivBragLine, vivPick, type VivAnswers, VIVARIUM_INTRO_POST_ID } from "@/lib/vivariumTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof VivAnswers; q: string; options: { label: string; value: VivAnswers[keyof VivAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "space", q: "사육장을 놓을 자리는?", options: [{ label: "책상 위 작은 자리", value: "desk" }, { label: "선반 한 칸", value: "shelf" }, { label: "큰 장도 놓을 수 있어요", value: "large" }] },
  { key: "time", q: "돌볼 시간은?", options: [{ label: "일주일에 한 번", value: "weekly" }, { label: "하루 5분", value: "daily5" }, { label: "매일 들여다보는 게 즐거움", value: "daily" }] },
  { key: "insects", q: "살아 있는 곤충 먹이는?", options: [{ label: "괜찮아요", value: true }, { label: "자신 없어요", value: false }] },
  { key: "touch", q: "생물을 손에 올려 보고 싶나요?", options: [{ label: "네, 만져 보고 싶어요", value: true }, { label: "보기만 해도 좋아요", value: false }] },
];

/** 🦎 우리 집에서 키울 수 있을까? 1분 테스트 (Sprint 83) */
export function VivariumTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<VivAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🦎 비바리움 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "우리 집에서 키울 수 있을까?" : q.q}</h1>
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

  const pick = vivPick(answers as VivAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나에게 맞는 첫 생물</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.why}</p>
      <p className="hint">💡 {pick.note} 시작 전에는 샵이나 브리더와 꼭 상담해 보세요.</p>
      <QuickBrag
        postId={VIVARIUM_INTRO_POST_ID}
        line={vivBragLine(pick)}
        prompt="🦎 다른 덕후들은 뭘 키울까? 결과와 내 생물 한 줄 남기기"
        placeholder="예) 크레 2마리 / 키워 보고 싶은 건 다트프록"
      />
      <RoomPoll slug="비바리움-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/비바리움-덕후방" className="btn">
          🌿 비바리움 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
