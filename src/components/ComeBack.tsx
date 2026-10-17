"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { DebateTally } from "@/lib/repo/debateVotes";
import { DebateVote } from "./DebateVote";
import { PushButton } from "./PushButton";

/**
 * 테스트 결과 아래 "내일 또" (Sprint 77). 테스트는 한 번 하면 끝이라, 매일 바뀌는 것 하나와 아침 알림을 붙인다.
 * poll 을 주면 📚 오늘의 책 질문을 그 자리에서 버튼 한 번으로 투표.
 */
export function ComeBack({ poll }: { poll?: boolean }) {
  const [today, setToday] = useState<{ postId: string; title: string; tally: DebateTally } | null>(null);

  useEffect(() => {
    if (!poll) return;
    api<{ postId: string; title: string; tally: DebateTally } | null>("/api/debate/vote?kind=bookpoll", "GET")
      .then(setToday)
      .catch(() => {});
  }, [poll]);

  return (
    <div className="come-back">
      {today && (
        <>
          <b>{today.title}</b>
          <DebateVote postId={today.postId} initial={today.tally} push={false} />
        </>
      )}
      <p>
        📅 매일 새 문제 1개 · <Link href="/daily?from=result">오늘 문제 풀기</Link>
      </p>
      <PushButton label="🔔 내일 아침 새 문제 알림" onLabel="🔔 내일 아침 알려 드릴게요" daily />
    </div>
  );
}
