"use client";

import Link from "next/link";
import { useState } from "react";
import { coffeeBragLine, coffeePick, type CoffeeAnswers, COFFEE_INTRO_POST_ID } from "@/lib/coffeeTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof CoffeeAnswers; q: string; options: { label: string; value: CoffeeAnswers[keyof CoffeeAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "ice", q: "겨울에도?", options: [{ label: "아아", value: true }, { label: "따뜻한 거", value: false }] },
  { key: "sweet", q: "더 끌리는 메뉴는?", options: [{ label: "달달한 거", value: true }, { label: "쓴 블랙", value: false }] },
  { key: "beans", q: "원두는?", options: [{ label: "산지까지 골라요", value: true }, { label: "아무거나 괜찮아요", value: false }] },
  { key: "home", q: "주말 커피는?", options: [{ label: "집에서 직접 내려요", value: true }, { label: "카페 가서", value: false }] },
  { key: "space", q: "카페 고를 때 먼저 보는 건?", options: [{ label: "분위기·자리", value: true }, { label: "커피 맛", value: false }] },
  { key: "takeout", q: "주문하고 나면?", options: [{ label: "테이크아웃", value: true }, { label: "앉아서 오래", value: false }] },
  { key: "milk", q: "우유 들어간 커피는?", options: [{ label: "좋아요", value: true }, { label: "블랙만", value: false }] },
];

/** ☕ 나는 어떤 커피러? 1분 테스트 (10/23, 신발 테스트와 같은 틀) */
export function CoffeeTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<CoffeeAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">☕ 커피 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 커피러?" : q.q}</h1>
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

  const pick = coffeePick(answers as CoffeeAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 커피 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={COFFEE_INTRO_POST_ID}
        line={coffeeBragLine(pick)}
        prompt="☕ 다른 사람들은 어떤 타입일까? 결과와 요즘 마시는 커피 한 줄"
        placeholder="예) 출근길 아아 한 잔 / 주말엔 집에서 드립"
      />
      <RoomPoll slug="커피-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/커피-덕후방" className="btn">
          ☕ 커피 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
