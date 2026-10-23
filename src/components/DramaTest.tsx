"use client";

import Link from "next/link";
import { useState } from "react";
import { dramaBragLine, dramaPick, type DramaAnswers, DRAMA_INTRO_POST_ID } from "@/lib/dramaTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof DramaAnswers; q: string; options: { label: string; value: DramaAnswers[keyof DramaAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "binge", q: "새 드라마 시작하면?", options: [{ label: "다 끝나고 몰아서", value: true }, { label: "방송하는 날 바로", value: false }] },
  { key: "live", q: "본방 시간 알람은?", options: [{ label: "맞춰 둬요", value: true }, { label: "굳이 안 맞춰요", value: false }] },
  { key: "spoil", q: "결말이 궁금하면?", options: [{ label: "먼저 찾아봐요", value: true }, { label: "끝까지 참아요", value: false }] },
  { key: "quote", q: "좋은 대사 나오면?", options: [{ label: "캡처해 둬요", value: true }, { label: "그냥 넘어가요", value: false }] },
  { key: "chat", q: "보면서 하는 건?", options: [{ label: "실시간 반응 구경", value: true }, { label: "화면에만 집중", value: false }] },
  { key: "rewatch", q: "좋아하는 장면은?", options: [{ label: "몇 번이고 다시 봐요", value: true }, { label: "한 번이면 충분", value: false }] },
  { key: "night", q: "다음 화 자동재생 뜨면?", options: [{ label: "일단 누르고 봐요", value: true }, { label: "오늘은 여기까지", value: false }] },
];

/** 📺 나는 어떤 드라마러? 1분 테스트 (10/23, 신발 테스트와 같은 틀) */
export function DramaTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<DramaAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">📺 드라마 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 드라마러?" : q.q}</h1>
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

  const pick = dramaPick(answers as DramaAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 드라마 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={DRAMA_INTRO_POST_ID}
        line={dramaBragLine(pick)}
        prompt="📺 다른 사람들은 어떤 타입일까? 결과와 요즘 보는 드라마 한 줄"
        placeholder="예) 주말에 한 작품씩 몰아봐요 / 요즘은 금토 본방"
      />
      <RoomPoll slug="드라마-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/드라마-덕후방" className="btn">
          📺 드라마 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
