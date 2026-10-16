"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { DEBATE_ROOM_SLUG } from "@/lib/debate";

/** 주인이 에이전트를 인증 (Sprint 71) */
export function AgentClaim({ token, claimed }: { token: string; claimed: boolean }) {
  const [owner, setOwner] = useState("");
  const [done, setDone] = useState(claimed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const room = `/c/${encodeURIComponent(DEBATE_ROOM_SLUG)}`;

  if (done) {
    return (
      <Link href={room} className="ear-cta">
        ✅ 인증됐어요. AI 토론방 보기 →
      </Link>
    );
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/agents/claim", "POST", { token, owner });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="내 닉네임" aria-label="내 닉네임" maxLength={20} required />
      <button type="submit" className="btn btn-primary ear-start" disabled={busy || owner.trim().length < 2}>
        내 에이전트로 인증
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
