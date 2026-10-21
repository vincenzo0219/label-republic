"use client";

import Link from "next/link";
import { useState } from "react";
import { baseballBragLine, baseballPick, type BaseballAnswers, BASEBALL_INTRO_POST_ID } from "@/lib/baseballTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof BaseballAnswers; q: string; options: { label: string; value: BaseballAnswers[keyof BaseballAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "stadium", q: "경기는 주로 어디서 봐요?", options: [{ label: "야구장 직관", value: true }, { label: "중계로", value: false }] },
  { key: "cheer", q: "응원가·응원 동작 다 따라 해요?", options: [{ label: "네, 다 외워요", value: true }, { label: "먹고 보는 게 먼저", value: false }] },
  { key: "analysis", q: "타율·OPS 같은 기록도 챙겨 봐요?", options: [{ label: "네, 꼼꼼히", value: true }, { label: "결과만 봐요", value: false }] },
  { key: "goods", q: "유니폼·응원 도구 모아요?", options: [{ label: "네, 꽤 있어요", value: true }, { label: "별로 없어요", value: false }] },
];

/** ⚾ 나는 어떤 야구 팬? 1분 테스트 (10/21, FanTest 와 같은 틀) */
export function BaseballTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<BaseballAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">⚾ 야구 팬 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 야구 팬?" : q.q}</h1>
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

  const pick = baseballPick(answers as BaseballAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 팬 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={BASEBALL_INTRO_POST_ID}
        line={baseballBragLine(pick)}
        prompt="⚾ 다른 팬들은 어떤 타입일까? 결과와 응원 구단 한 줄"
        placeholder="예) KIA / 광주 직관파"
      />
      <RoomPoll slug="kbo-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/kbo-덕후방" className="btn">
          ⚾ KBO 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
