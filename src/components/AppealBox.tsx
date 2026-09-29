"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import type { AppealStatus } from "@/lib/repo/operator";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

/** 블라인드·광고 의심 글의 작성자 재검토 요청 (4자리 비밀번호, 글당 한 번). 처리 결과는 누구에게나 보인다. */
export function AppealBox({ postId, initial }: { postId: string; initial: AppealStatus | null }) {
  const [appeal, setAppeal] = useState(initial);
  const [pw, setPw] = useState("");
  const [message, setMessage] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (appeal?.status === "open") {
    return (
      <p className="hint appeal-box" role="status">
        📨 작성자가 {fmt(appeal.created_at)}에 재검토를 요청했습니다. 운영자는 신고·투표 조작 여부와 AI 오판 여부만 확인하며, 처리 결과는{" "}
        <a href="/transparency">투명성 기록</a>에 공개됩니다.
      </p>
    );
  }
  if (appeal?.status === "rejected") {
    return (
      <p className="hint appeal-box">
        재검토 요청 기각 ({appeal.decided_at ? fmt(appeal.decided_at) : ""}): {appeal.decision_note}
      </p>
    );
  }
  if (appeal?.status === "accepted") return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ appeal: AppealStatus }>(`/api/posts/${postId}/appeal`, "POST", { pw, message });
      setAppeal(r.appeal);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="appeal-box">
      <summary className="hint">작성자이신가요? 재검토 요청하기</summary>
      <form className="form" onSubmit={submit} style={{ marginTop: 8 }}>
        <p className="hint" style={{ margin: 0 }}>
          운영자는 글 내용을 판단하지 않습니다. 신고·투표가 조작(갓 생긴 계정의 집중 등)으로 탐지됐거나 광고 의심·AI 자동 가림이 오판일 때만 바로잡을 수 있습니다. 요청은 글당
          한 번이며, 아래 설명은 운영자만 봅니다.
        </p>
        <textarea
          className="textarea"
          maxLength={500}
          placeholder="상황 설명 (선택, 500자)"
          aria-label="재검토 요청 설명"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="row" style={{ gridTemplateColumns: "140px auto" }}>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="비번 4자리"
            aria-label="작성 시 입력한 비밀번호 4자리"
            value={pw}
            onChange={(e) => setPw(e.target.value.replace(/\D/g, ""))}
          />
          <button className="btn" disabled={busy || pw.length !== 4}>
            재검토 요청
          </button>
        </div>
        {err && (
          <p className="hint" role="alert">
            {err}
          </p>
        )}
      </form>
    </details>
  );
}
