"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { myNick, myPin } from "@/lib/me";
import { WRITER_BADGE_ENABLED } from "@/lib/badges";
import { writerBragLine, writerPick, type WriterAnswers, WRITER_INTRO_POST_ID } from "@/lib/writerTest";
import { QuickBrag } from "./QuickBrag";
import { RoomPoll } from "./RoomPoll";

type Q = { key: keyof WriterAnswers; q: string; options: { label: string; value: WriterAnswers[keyof WriterAnswers] }[] };

const QUESTIONS: Q[] = [
  { key: "start", q: "주인공이 눈뜬 곳은?", options: [
    { label: "낯선 이세계 숲", value: "fantasy" }, { label: "10년 전 내 방", value: "hyunpan" }, { label: "소설 속 악녀의 몸", value: "rofan" },
  ] },
  { key: "scene", q: "제일 쓰고 싶은 장면은?", options: [
    { label: "검이 부딪히는 대결", value: "murim" }, { label: "고백 직전 눈 마주침", value: "romance" }, { label: "역사가 바뀌는 순간", value: "althist" },
  ] },
  { key: "notes", q: "설정 노트에 제일 많은 건?", options: [
    { label: "마법 체계·종족", value: "fantasy" }, { label: "문파·무공 이름", value: "murim" }, { label: "연표·기술 자료", value: "althist" },
  ] },
  { key: "grow", q: "주인공이 크는 방식은?", options: [
    { label: "각성하고 레벨업", value: "hyunpan" }, { label: "사교계에서 판 뒤집기", value: "rofan" }, { label: "사랑하면서 변해요", value: "romance" },
  ] },
  { key: "comment", q: "듣고 싶은 댓글은?", options: [
    { label: "사이다 미쳤다", value: "cider" }, { label: "세계관 미쳤다", value: "world" }, { label: "설렘 미쳤다", value: "flutter" },
  ] },
];

/** 결과를 내 닉네임 것으로 저장 (작가지망생방 배지). 닉네임이 없거나 실패해도 조용히 넘어간다 */
function saveResult(result: string, nickname = myNick(), pw = myPin()) {
  if (!WRITER_BADGE_ENABLED || nickname.trim().length < 2) return;
  fetch("/api/test-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: "writer", result, nickname: nickname.trim(), pw }),
    keepalive: true,
  }).catch(() => {});
}

/** ✍️ 나는 어떤 장르 작가? 1분 테스트 (10/24, 육아 테스트와 같은 틀) */
export function WriterTest() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<WriterAnswers>>({});
  const finished = step >= QUESTIONS.length;
  const resultKey = finished ? writerPick(answers as WriterAnswers).key : null;
  useEffect(() => {
    if (resultKey) saveResult(resultKey);
  }, [resultKey]);

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step]!;
    return (
      <section className="ear-card">
        <p className="ear-kicker">✍️ 장르 작가 1분 테스트 · {step + 1}/{QUESTIONS.length}</p>
        <h1 className="ear-title">{step === 0 ? "나는 어떤 장르 작가?" : q.q}</h1>
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

  const pick = writerPick(answers as WriterAnswers);
  return (
    <section className="ear-card">
      <p className="ear-kicker">나의 장르</p>
      <p className="ear-tier">
        <span aria-hidden>{pick.emoji}</span> {pick.name}
      </p>
      <p>{pick.what}</p>
      <QuickBrag
        postId={WRITER_INTRO_POST_ID}
        line={writerBragLine(pick)}
        prompt="✍️ 결과와 요즘 쓰는 글 한 줄"
        placeholder="예) 회귀물 3화 / 공모전 준비"
        onPosted={(nickname, pw) => saveResult(pick.key, nickname, pw)}
      />
      <RoomPoll slug="작가지망생방" />
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setStep(0); setAnswers({}); }}>
          다시 하기
        </button>
        <Link href="/c/작가지망생방" className="btn">
          ✍️ 작가지망생방 가기
        </Link>
      </div>
    </section>
  );
}
