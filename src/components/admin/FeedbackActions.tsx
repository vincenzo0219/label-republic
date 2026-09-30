"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/feedback";

/** 제보 상태·공개 답변 (Sprint 36). 공개 답변은 현황판에 그대로 보인다 */
export function FeedbackActions({ id, status, note }: { id: string; status: FeedbackStatus; note: string }) {
  const router = useRouter();
  const [next, setNext] = useState<FeedbackStatus>(status);
  const [text, setText] = useState(note);
  const [dup, setDup] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/feedback", "POST", { id, status: next, note: text, duplicateOf: next === "duplicate" ? dup : null });
      setMsg("저장했습니다");
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="mod-actions" onSubmit={save} aria-label={`#${id} 처리`}>
      <select className="select input-sm" value={next} onChange={(e) => setNext(e.target.value as FeedbackStatus)} aria-label={`#${id} 상태`}>
        {(Object.keys(FEEDBACK_STATUS) as FeedbackStatus[]).map((s) => (
          <option key={s} value={s}>
            {FEEDBACK_STATUS[s]}
          </option>
        ))}
      </select>
      {next === "duplicate" && (
        <input className="input input-sm" inputMode="numeric" placeholder="같은 제보 번호" aria-label={`#${id} 같은 제보 번호`} value={dup} onChange={(e) => setDup(e.target.value)} />
      )}
      <input className="input input-sm" maxLength={500} placeholder="공개 답변 (현황판에 보임)" aria-label={`#${id} 공개 답변`} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-sm" disabled={busy}>
        저장
      </button>
      {msg && <span className="hint">{msg}</span>}
    </form>
  );
}
