"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { DebateTally } from "@/lib/repo/debateVotes";
import { DebateVote } from "./DebateVote";

type Yesterday = { a: string; b: string; A: number; B: number };
type Poll = { postId: string; title: string; tally: DebateTally; yesterday?: Yesterday | null; nextAt?: string };

/** 다음 질문까지 남은 시간 "3시간 12분" / "12분" */
export function untilLabel(nextAt: string, now = Date.now()): string | null {
  const ms = Date.parse(nextAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.ceil(ms / 60_000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}시간 ${m % 60}분` : `${m}분`;
}

/**
 * 🗳 방 맨 위 오늘의 질문 (Sprint 83) — 글에 들어가지 않아도 버튼 한 번으로 투표.
 * 📅 11/1 대표님 "테스트 끝에 내일 다시 올 이유": 어제 결과를 위에, 다음 질문이 열리는 시간을 아래에 보여 준다
 */
export function RoomPoll({ slug }: { slug: string }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    api<Poll | null>(`/api/debate/vote?kind=room&slug=${encodeURIComponent(slug)}`, "GET")
      .then(setPoll)
      .catch(() => {});
  }, [slug]);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!poll) return null;
  const y = poll.yesterday;
  const yn = y ? y.A + y.B : 0;
  const ya = y && yn ? Math.round((y.A / yn) * 100) : 0;
  const until = poll.nextAt && now !== null ? untilLabel(poll.nextAt, now) : null;
  return (
    <section className="come-back" aria-label="오늘의 질문">
      <p className="hint">📅 매일 바뀌는 오늘의 질문 · 다음 날 최종 결과가 여기 올라와요</p>
      {y && yn > 0 && (
        <p className="poll-yesterday">
          📊 어제 결과: {y.a} {ya}% vs {y.b} {100 - ya}% ({yn}명)
        </p>
      )}
      <b>{poll.title}</b>
      <DebateVote postId={poll.postId} initial={poll.tally} />
      {until && <p className="hint poll-next">⏰ 다음 질문까지 {until} · 내일 또 와서 오늘 결과를 확인해요</p>}
    </section>
  );
}
