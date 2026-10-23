"use client";

import Link from "next/link";
import { useState } from "react";
import { debateBragLine, debatePick, type DebateAnswers, DEBATE_TEST_POST_ID } from "@/lib/debateTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof DebateAnswers; q: string; options: { label: string; value: DebateAnswers[keyof DebateAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "evidence", q: "말다툼이 붙으면 먼저?", options: [{ label: "자료부터 찾아요", value: true }, { label: "생각부터 말해요", value: false }] },
  { key: "empathy", q: "상대 말 듣고 먼저 나오는 말은?", options: [{ label: "그럴 수 있지", value: true }, { label: "근데 그건 아니지", value: false }] },
  { key: "last", q: "질 것 같을 때는?", options: [{ label: "끝까지 반박", value: true }, { label: "깔끔하게 인정", value: false }] },
  { key: "flip", q: "반대편 입장을?", options: [{ label: "일부러 해 봐요", value: true }, { label: "굳이요", value: false }] },
  { key: "calm", q: "분위기가 험해지면?", options: [{ label: "중간에서 정리해요", value: true }, { label: "계속 달려요", value: false }] },
  { key: "facts", q: "결론 내기 전에?", options: [{ label: "숫자·사례 챙겨요", value: true }, { label: "감으로 충분해요", value: false }] },
  { key: "fun", q: "토론이 재밌는 이유는?", options: [{ label: "새로운 관점", value: true }, { label: "이기는 맛", value: false }] },
];

/** ⚖️ 나의 토론 스타일은? 1분 테스트 (10/23, 커피 테스트와 같은 틀) */
export function DebateTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<DebateAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">⚖️ 토론 스타일 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나의 토론 스타일은?" : q.q}</h1>
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

  const pick = debatePick(answers as DebateAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 토론 스타일</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={DEBATE_TEST_POST_ID}
        line={debateBragLine(pick)}
        prompt="⚖️ 다른 사람들은 어떤 스타일일까? 결과와 부먹 찍먹 한 줄"
        placeholder="예) 찍먹, 바삭함이 생명이라서"
      />
      <RoomPoll slug="ai-밸런스-토론방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/ai-밸런스-토론방" className="btn">
          ⚖️ AI 밸런스 토론방 가기
        </Link>
      </div>
    </section>
  );
}
