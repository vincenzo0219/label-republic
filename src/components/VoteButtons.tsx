"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

type State = { upvotes: number; downvotes: number; myVote: 1 | -1 | 0 };

export function VoteButtons({ postId, initial }: { postId: string; initial: State }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function vote(value: 1 | -1) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<State>(`/api/posts/${postId}/vote`, "POST", { value });
      setState({ upvotes: res.upvotes, downvotes: res.downvotes, myVote: res.myVote });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="vote-row">
        <button className="btn vote-btn up" aria-pressed={state.myVote === 1} disabled={busy} onClick={() => vote(1)}>
          👍 추천 {state.upvotes}
        </button>
        <button className="btn vote-btn down" aria-pressed={state.myVote === -1} disabled={busy} onClick={() => vote(-1)}>
          👎 비추천 {state.downvotes}
        </button>
      </div>
      {error && <p className="error" style={{ textAlign: "center" }}>{error}</p>}
    </>
  );
}
