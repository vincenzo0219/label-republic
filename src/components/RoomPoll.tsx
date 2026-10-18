"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { DebateTally } from "@/lib/repo/debateVotes";
import { DebateVote } from "./DebateVote";

/** 🗳 방 맨 위 오늘의 질문 (Sprint 83) — 글에 들어가지 않아도 버튼 한 번으로 투표 */
export function RoomPoll({ slug }: { slug: string }) {
  const [poll, setPoll] = useState<{ postId: string; title: string; tally: DebateTally } | null>(null);
  useEffect(() => {
    api<{ postId: string; title: string; tally: DebateTally } | null>(`/api/debate/vote?kind=room&slug=${encodeURIComponent(slug)}`, "GET")
      .then(setPoll)
      .catch(() => {});
  }, [slug]);
  if (!poll) return null;
  return (
    <section className="come-back" aria-label="오늘의 질문">
      <b>{poll.title}</b>
      <DebateVote postId={poll.postId} initial={poll.tally} />
    </section>
  );
}
