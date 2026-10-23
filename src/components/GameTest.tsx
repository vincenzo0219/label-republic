"use client";

import Link from "next/link";
import { useState } from "react";
import { gameBragLine, gamePick, type GameAnswers, GAME_INTRO_POST_ID } from "@/lib/gameTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof GameAnswers; q: string; options: { label: string; value: GameAnswers[keyof GameAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "rank", q: "같은 게임이면?", options: [{ label: "랭크 돌려요", value: true }, { label: "일반이 편해요", value: false }] },
  { key: "story", q: "더 끌리는 게임은?", options: [{ label: "스토리 좋은 게임", value: true }, { label: "이기고 지는 게임", value: false }] },
  { key: "night", q: "재밌는 게임 잡으면?", options: [{ label: "밤새 해요", value: true }, { label: "자기 전에 끊어요", value: false }] },
  { key: "friends", q: "주로 누구랑?", options: [{ label: "친구랑 같이", value: true }, { label: "혼자 조용히", value: false }] },
  { key: "voice", q: "같이 할 때 보이스챗은?", options: [{ label: "무조건 켜요", value: true }, { label: "채팅이면 충분", value: false }] },
  { key: "phone", q: "제일 많이 켜는 건?", options: [{ label: "폰", value: true }, { label: "PC·콘솔", value: false }] },
  { key: "short", q: "게임 시간은?", options: [{ label: "틈틈이 10분씩", value: true }, { label: "날 잡고 몰아서", value: false }] },
];

/** 🎮 나는 어떤 게이머? 1분 테스트 (10/23, 신발 테스트와 같은 틀) */
export function GameTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<GameAnswers>>({});

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">🎮 게임 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 게이머?" : q.q}</h1>
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

  const pick = gamePick(answers as GameAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 게임 타입</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={GAME_INTRO_POST_ID}
        line={gameBragLine(pick)}
        prompt="🎮 다른 사람들은 어떤 타입일까? 결과와 요즘 하는 게임 한 줄"
        placeholder="예) 요즘은 퇴근하고 한두 판 / 주말엔 친구들이랑"
      />
      <RoomPoll slug="게임-덕후방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/게임-덕후방" className="btn">
          🎮 게임 덕후방 가기
        </Link>
      </div>
    </section>
  );
}
