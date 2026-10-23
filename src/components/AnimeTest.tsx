"use client";

import Link from "next/link";
import { useState } from "react";
import { animeBragLine, animePick, type AnimeAnswers, ANIME_INTRO_POST_ID } from "@/lib/animeTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof AnimeAnswers; q: string; options: { label: string; value: AnimeAnswers[keyof AnimeAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "goods", q: "최애 굿즈 나오면?", options: [{ label: "일단 사요", value: true }, { label: "구경만 해요", value: false }] },
  { key: "binge", q: "완결 난 애니 발견하면?", options: [{ label: "하루에 몰아봐요", value: true }, { label: "한두 화씩 천천히", value: false }] },
  { key: "manga", q: "원작 vs 애니?", options: [{ label: "원작 먼저", value: true }, { label: "애니 먼저", value: false }] },
  { key: "event", q: "코믹월드 같은 행사는?", options: [{ label: "챙겨 가요", value: true }, { label: "온라인으로 구경", value: false }] },
  { key: "cosplay", q: "코스프레는?", options: [{ label: "해 봤거나 해 보고 싶어요", value: true }, { label: "보는 걸로 충분", value: false }] },
  { key: "next", q: "다음 화가 궁금하면?", options: [{ label: "원작 찾아봐요", value: true }, { label: "방송 기다려요", value: false }] },
  { key: "shelf", q: "방 한쪽에는?", options: [{ label: "굿즈 진열장", value: true }, { label: "만화책 책장", value: false }] },
];

/** 🎨 나는 어떤 오타쿠? 1분 테스트 (10/23, 신발 테스트와 같은 틀) */
export function AnimeTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<AnimeAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🎨 애니·만화 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 오타쿠?" : q.q}</h1>
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

  const pick = animePick(answers as AnimeAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 덕질 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={ANIME_INTRO_POST_ID}
        line={animeBragLine(pick)}
        prompt="🎨 다른 사람들은 어떤 타입일까? 결과와 요즘 보는 작품 한 줄"
        placeholder="예) 요즘은 원작 만화 정주행 중 / 이번 코믹월드 가요"
      />
      <RoomPoll slug="애니-만화-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/애니-만화-덕후방" className="btn">
          🎨 애니·만화 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
