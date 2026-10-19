"use client";

import Link from "next/link";
import { useState } from "react";
import { fanBragLine, fanPick, type FanAnswers, FAN_INTRO_POST_ID } from "@/lib/fanTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof FanAnswers; q: string; options: { label: string; value: FanAnswers[keyof FanAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "stadium", q: "경기는 주로 어디서 봐요?", options: [{ label: "경기장 직관", value: true }, { label: "중계로", value: false }] },
  { key: "away", q: "원정 경기도 따라가 봤어요?", options: [{ label: "네, 가 봤어요", value: true }, { label: "아직이요", value: false }] },
  { key: "analysis", q: "포메이션·기록도 챙겨 봐요?", options: [{ label: "네, 꼼꼼히", value: true }, { label: "결과만 봐요", value: false }] },
  { key: "goods", q: "유니폼·굿즈 모아요?", options: [{ label: "네, 꽤 있어요", value: true }, { label: "별로 없어요", value: false }] },
];

/** ⚽ 나는 어떤 축구 팬? 1분 테스트 (Sprint 91) */
export function FanTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<FanAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">⚽ 축구 팬 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 축구 팬?" : q.q}</h1>
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

  const pick = fanPick(answers as FanAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 팬 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={FAN_INTRO_POST_ID}
        line={fanBragLine(pick)}
        prompt="⚽ 다른 팬들은 어떤 타입일까? 결과와 응원 팀 한 줄"
        placeholder="예) 전남드래곤즈 / 광양 직관파"
      />
      <RoomPoll slug="k리그-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/k리그-덕후방" className="btn">
          ⚽ K리그 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
