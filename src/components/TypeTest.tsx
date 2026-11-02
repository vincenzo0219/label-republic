"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { decodeMate, encodeMate, SITE } from "@/lib/friendLink";
import { myNick } from "@/lib/me";
import { compatOf, pickType, sameTypeLine, type TTType, type TypeTest as TT } from "@/lib/typeTests/engine";
import { FriendLink, MateCard, useFromQuery } from "./FriendLink";

type Saved = { total: number; counts: Record<string, number>; type: string; same: number };

/**
 * 🧩 설정으로 만드는 타입 테스트 화면 (11/2). /t/<key> 와 방 🧩 놀이 탭에서 같이 쓴다.
 * 결과는 익명으로 저장해(서버가 다시 채점) "같은 타입 n%" 를 실제 센 값으로 보여 준다. 친구 궁합은 ?m=타입&n=닉네임 링크
 */
export function TypeTest({ test, embedded = false }: { test: TT; embedded?: boolean }) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const types = Object.fromEntries(test.types.map((t) => [t.key, t])) as Record<string, TTType>;
  const mate = useFromQuery((q) => (embedded ? null : decodeMate(q, types)));
  const step = answers.length;
  const done = step >= test.questions.length;
  const pick = done ? pickType(test, answers) : null;

  useEffect(() => {
    if (!done) return;
    let live = true;
    api<Saved>("/api/type-test", "POST", { test: test.key, answers })
      .then((r) => live && setSaved(r))
      .catch(() => live && setSaveFailed(true));
    return () => {
      live = false;
    };
  }, [done, test.key, answers]);

  const restart = () => {
    setAnswers([]);
    setSaved(null);
    setSaveFailed(false);
  };

  if (!done || !pick) {
    const q = test.questions[step]!;
    const long = test.long || q.options.length > 2;
    const Title = embedded ? "h2" : "h1";
    return (
      <section className={`ear-card tt-test${embedded ? " tt-embedded" : ""}`}>
        {step === 0 && mate && (
          <p className="vs-banner">
            💞 <b>{mate.name}</b>님이 궁합 링크를 보냈어요. 끝까지 하면 둘의 궁합이 나와요.
          </p>
        )}
        <p className="ear-kicker">
          {test.emoji} {test.title} · {step + 1}/{test.questions.length}
        </p>
        {step === 0 && <p className="hint">{test.intro}</p>}
        <Title className="ear-title">{q.q}</Title>
        <div className="tt-progress" aria-hidden>
          <span style={{ width: `${(step / test.questions.length) * 100}%` }} />
        </div>
        <div className={`ear-choices${long ? " ear-long" : ""}`}>
          {q.options.map((o, i) => (
            <button key={o.label} type="button" className="btn ear-choice" onClick={() => setAnswers([...answers, i])}>
              {o.label}
            </button>
          ))}
        </div>
        {step > 0 && (
          <button type="button" className="btn btn-ghost tt-back" onClick={() => setAnswers(answers.slice(0, -1))}>
            ← 이전 질문
          </button>
        )}
      </section>
    );
  }

  const compat = mate ? compatOf(test.key, mate.type.key, pick.key) : null;
  const total = saved?.total ?? 0;
  return (
    <section className={`ear-card tt-test${embedded ? " tt-embedded" : ""}`}>
      <div className="tt-card" aria-live="polite">
        <p className="tt-card-kicker">
          {test.emoji} {test.resultLabel}
        </p>
        <p className="tt-card-emoji" aria-hidden>
          {pick.emoji}
        </p>
        <p className="tt-card-name">{pick.name}</p>
        <p className="tt-card-what">{pick.what}</p>
        {saved && <p className="tt-card-same">{sameTypeLine(saved.same, saved.total)}</p>}
        <p className="tt-card-site">노방장 · nobangjang.com</p>
      </div>
      {saveFailed && <p className="hint">분포를 불러오지 못했어요. 결과는 그대로예요.</p>}
      {mate && compat && (
        <MateCard kicker={`💞 ${mate.name}님과 나의 궁합`} friend={`${mate.type.emoji} ${mate.type.name}`} me={`${pick.emoji} ${pick.name}`} pct={compat.pct} line={compat.line} />
      )}
      {saved && total >= 10 && (
        <ul className="tt-dist" aria-label="타입 분포">
          {test.types.map((t) => {
            const pct = Math.round(((saved.counts[t.key] ?? 0) / total) * 100);
            return (
              <li key={t.key} className={t.key === pick.key ? "is-me" : undefined}>
                <span className="tt-dist-name">
                  {t.emoji} {t.name}
                </span>
                <span className="tt-dist-bar">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="tt-dist-pct">{pct}%</span>
              </li>
            );
          })}
        </ul>
      )}
      {test.note && <p className="hint tt-note">{test.note}</p>}
      <div className="tt-share">
        <FriendLink
          label={mate ? "💞 다른 친구와도 궁합 보기" : "💞 친구와 궁합 보내기"}
          text={`${test.emoji} ${test.resultLabel}: ${pick.emoji} ${pick.name}. 너도 해 보고 우리 궁합 확인해 봐!`}
          makeUrl={() => encodeMate(`/t/${test.key}`, pick.key, myNick())}
          click={`tt-mate-${test.key}`}
        />
        <FriendLink
          className="btn"
          label="📤 결과 카드 공유"
          text={`${test.emoji} ${test.resultLabel}은 ${pick.emoji} ${pick.name}!`}
          makeUrl={() => `${SITE}/t/${test.key}?r=${pick.key}&from=share`}
          click={`tt-share-${test.key}`}
        />
      </div>
      <div className="ear-actions">
        <button type="button" className="btn btn-ghost" onClick={restart}>
          다시 하기
        </button>
        {embedded ? (
          <Link href={`/t/${test.key}`} className="btn">
            🔗 테스트 주소 열기
          </Link>
        ) : (
          <Link href={`/c/${test.room}?tab=play`} className="btn">
            {test.emoji} {test.roomName} 가기
          </Link>
        )}
      </div>
    </section>
  );
}
