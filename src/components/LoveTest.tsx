"use client";

import Link from "next/link";
import { useState } from "react";
import { loveBragLine, lovePick, type LoveAnswers, LOVE_INTRO_POST_ID } from "@/lib/loveTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof LoveAnswers; q: string; options: { label: string; value: LoveAnswers[keyof LoveAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "first", q: "마음에 드는 사람이 생기면?", options: [{ label: "먼저 연락해요", value: true }, { label: "연락 오길 기다려요", value: false }] },
  { key: "slow", q: "연애 시작은?", options: [{ label: "친구로 오래 보고 천천히", value: true }, { label: "끌리면 바로", value: false }] },
  { key: "talk", q: "제일 중요한 건?", options: [{ label: "대화가 잘 통하는 것", value: true }, { label: "같이 하는 활동이 맞는 것", value: false }] },
  { key: "plan", q: "데이트 코스는?", options: [{ label: "미리 짜 둬요", value: true }, { label: "그날 기분대로", value: false }] },
  { key: "reply", q: "연락은?", options: [{ label: "보면 바로 답장", value: true }, { label: "여유 있을 때 몰아서", value: false }] },
  { key: "place", q: "첫 만남 장소는?", options: [{ label: "조용한 카페", value: true }, { label: "전시·공연·액티비티", value: false }] },
  { key: "sure", q: "확신이 들면?", options: [{ label: "바로 마음을 말해요", value: true }, { label: "좀 더 지켜봐요", value: false }] },
];

/** 💘 나의 연애 성향 1분 테스트 (10/30, 애니 테스트와 같은 틀) */
export function LoveTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<LoveAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">💘 연애 성향 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나의 연애 성향은?" : q.q}</h1>
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

  const pick = lovePick(answers as LoveAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 연애 성향</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={LOVE_INTRO_POST_ID}
        line={loveBragLine(pick)}
        prompt="💘 다른 사람들은 어떤 성향일까? 결과와 이상형 한 줄 (이름·연락처는 빼고)"
        placeholder="예) 웃는 게 예쁜 사람 / 같이 산책할 사람"
      />
      <RoomPoll slug="미혼남녀-만남-행사" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/미혼남녀-만남-행사" className="btn">
          💌 미혼남녀 만남 행사 방 가기
        </Link>
      </div>
    </section>
  );
}
