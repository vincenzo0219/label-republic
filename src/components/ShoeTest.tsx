"use client";

import Link from "next/link";
import { useState } from "react";
import { shoeBragLine, shoePick, type ShoeAnswers, SHOE_INTRO_POST_ID } from "@/lib/shoeTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof ShoeAnswers; q: string; options: { label: string; value: ShoeAnswers[keyof ShoeAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "halfUp", q: "운동화 사이즈는?", options: [{ label: "정사이즈", value: false }, { label: "반업", value: true }] },
  { key: "sneaker", q: "평소에 더 자주 신는 건?", options: [{ label: "운동화", value: true }, { label: "구두·부츠", value: false }] },
  { key: "wearOut", q: "한 켤레 사면?", options: [{ label: "닳을 때까지 신어요", value: true }, { label: "계절마다 새로", value: false }] },
  { key: "comfy", q: "고를 때 제일 중요한 건?", options: [{ label: "편한 게 최고", value: true }, { label: "예쁜 게 최고", value: false }] },
  { key: "draw", q: "갖고 싶은 신발 나오면?", options: [{ label: "발매일 드로우 응모", value: true }, { label: "그냥 매장에서", value: false }] },
  { key: "box", q: "새 신발 박스는?", options: [{ label: "박스째 보관", value: true }, { label: "바로 신고 버려요", value: false }] },
  { key: "clean", q: "흰 신발 관리는?", options: [{ label: "얼룩 보이면 바로 닦아요", value: true }, { label: "대충, 신발은 더러워져야 맛", value: false }] },
];

/** 👟 나는 어떤 신발러? 1분 테스트 (10/23, 요가 테스트와 같은 틀) */
export function ShoeTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<ShoeAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">👟 신발 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 신발러?" : q.q}</h1>
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

  const pick = shoePick(answers as ShoeAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 신발 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={SHOE_INTRO_POST_ID}
        line={shoeBragLine(pick)}
        prompt="👟 다른 사람들은 어떤 타입일까? 결과와 요즘 자주 신는 것 한 줄"
        placeholder="예) 흰 운동화 하나로 1년째 / 겨울엔 부츠"
      />
      <RoomPoll slug="신발-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/신발-덕후방" className="btn">
          👟 신발 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
