"use client";

import Link from "next/link";
import { useState } from "react";
import { vivTypeBragLine, vivTypePick, type VivTypeAnswers, VIV_TYPE_INTRO_POST_ID } from "@/lib/vivTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof VivTypeAnswers; q: string; options: { label: string; value: VivTypeAnswers[keyof VivTypeAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "keeping", q: "지금 키우는 생물이나 장이?", options: [{ label: "있어요", value: true }, { label: "아직 없어요", value: false }] },
  { key: "layout", q: "새 장 만들면 먼저?", options: [{ label: "레이아웃 구상", value: true }, { label: "생물부터 고르기", value: false }] },
  { key: "watch", q: "장 앞에 앉으면?", options: [{ label: "한참 구경해요", value: true }, { label: "할 일만 하고 가요", value: false }] },
  { key: "note", q: "사진·기록은?", options: [{ label: "꼬박꼬박 남겨요", value: true }, { label: "생각날 때만", value: false }] },
  { key: "search", q: "궁금한 게 생기면?", options: [{ label: "끝까지 찾아봐요", value: true }, { label: "물어보고 말아요", value: false }] },
  { key: "feed", q: "제일 재밌는 순간은?", options: [{ label: "밥 먹는 모습", value: true }, { label: "장 완성된 모습", value: false }] },
  { key: "plan", q: "장바구니에 담아 둔 게?", options: [{ label: "많아요", value: true }, { label: "거의 없어요", value: false }] },
];

/** 🌿 나는 어떤 비바리움러? 1분 테스트 (10/23, 신발 테스트와 같은 틀) */
export function VivTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<VivTypeAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🌿 비바리움 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 비바리움러?" : q.q}</h1>
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

  const pick = vivTypePick(answers as VivTypeAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 비바리움 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={VIV_TYPE_INTRO_POST_ID}
        line={vivTypeBragLine(pick)}
        prompt="🌿 다른 사람들은 어떤 타입일까? 결과와 키우는·키우고 싶은 생물 한 줄"
        placeholder="예) 이끼장 하나 꾸미는 중 / 아직 구경만 해요"
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
