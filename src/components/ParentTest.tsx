"use client";

import Link from "next/link";
import { useState } from "react";
import { parentBragLine, parentPick, type ParentAnswers, PARENT_INTRO_POST_ID } from "@/lib/parentTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof ParentAnswers; q: string; options: { label: string; value: ParentAnswers[keyof ParentAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "research", q: "새 육아템을 살 때는?", options: [{ label: "후기부터 비교해요", value: true }, { label: "일단 써 봐요", value: false }] },
  { key: "plan", q: "하루 일정은?", options: [{ label: "미리 짜 둬요", value: true }, { label: "그때그때 정해요", value: false }] },
  { key: "photo", q: "사진은?", options: [{ label: "매일 찍어요", value: true }, { label: "생각날 때만", value: false }] },
  { key: "diary", q: "육아 메모나 다이어리는?", options: [{ label: "꾸준히 써요", value: true }, { label: "마음에 담아 둬요", value: false }] },
  { key: "outing", q: "주말에는?", options: [{ label: "밖으로 나가요", value: true }, { label: "집에서 함께 놀아요", value: false }] },
  { key: "place", q: "가 볼 곳을 고를 때는?", options: [{ label: "새로운 곳 찾아요", value: true }, { label: "익숙한 곳이 편해요", value: false }] },
  { key: "easy", q: "계획이 틀어지면?", options: [{ label: "그럴 수도 있죠", value: true }, { label: "다시 짜 봐요", value: false }] },
];

/** 👶 나는 어떤 육아 타입? 1분 테스트 (10/23, 커피 테스트와 같은 틀) */
export function ParentTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<ParentAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">👶 육아 타입 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 육아 타입?" : q.q}</h1>
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

  const pick = parentPick(answers as ParentAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 육아 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={PARENT_INTRO_POST_ID}
        line={parentBragLine(pick)}
        prompt="👶 다른 분들은 어떤 타입일까? 결과와 요즘 고민 한 줄"
        placeholder="예) 주말마다 갈 곳 찾기 / 사진 정리가 밀려요"
      />
      <RoomPoll slug="육아-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/육아-덕후방" className="btn">
          👶 육아방 가기
        </Link>
      </div>
    </section>
  );
}
