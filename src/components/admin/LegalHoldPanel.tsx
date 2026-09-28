"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

const REASONS: [string, string][] = [
  ["defamation", "명예훼손"],
  ["privacy", "사생활·개인정보 침해"],
  ["copyright", "저작권 침해"],
  ["illegal", "불법정보"],
  ["court_order", "법원·수사기관 요청"],
];

/** 법적 임시조치 적용/해제 — 모든 조치는 /transparency 에 공개된다 */
export function LegalHoldPanel() {
  const router = useRouter();
  const [postId, setPostId] = useState("");
  const [reason, setReason] = useState("defamation");
  const [note, setNote] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(action: "hold" | "release" | "redact_revision") {
    setMsg(null);
    const verb = action === "hold" ? "임시조치" : action === "release" ? "해제" : `수정 이력 #${revisionId} 삭제`;
    if (!window.confirm(`글 #${postId}을(를) ${verb}합니다. 이 조치는 투명성 기록에 공개됩니다. 계속할까요?`)) return;
    try {
      await api(
        "/api/admin/legal-hold",
        "POST",
        action === "hold" ? { action, postId, reason, note } : action === "release" ? { action, postId, note } : { action, postId, revisionId, reason, note },
      );
      setMsg(`글 #${postId} ${verb} 완료`);
      setPostId("");
      setNote("");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="form">
      <div className="row" style={{ gridTemplateColumns: "120px 1fr" }}>
        <input className="input" inputMode="numeric" placeholder="글 번호" aria-label="게시글 번호" value={postId} onChange={(e) => setPostId(e.target.value.replace(/\D/g, ""))} />
        <select className="select" aria-label="사유" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <input className="input" maxLength={300} placeholder="공개 메모 (신고인·개인정보를 적지 마세요)" aria-label="공개 메모" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-danger" disabled={!postId} onClick={() => submit("hold")}>
          임시조치 (30일)
        </button>
        <button type="button" className="btn" disabled={!postId} onClick={() => submit("release")}>
          해제
        </button>
      </div>
      <div className="row" style={{ gridTemplateColumns: "1fr auto" }}>
        <input className="input" inputMode="numeric" placeholder="수정 이력 번호 (이전 판에서 개인정보·명예훼손 표현만 지울 때)" aria-label="수정 이력 번호" value={revisionId}
          onChange={(e) => setRevisionId(e.target.value.replace(/\D/g, ""))} />
        <button type="button" className="btn btn-danger" disabled={!postId || !revisionId} onClick={() => submit("redact_revision")}>
          이전 판 지우기
        </button>
      </div>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
