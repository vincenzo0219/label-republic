"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

/** 작성자: 수정 이력의 이전 판 내용 지우기 (글 비밀번호) */
export function RedactRevision({ postId, revisionId }: { postId: string; revisionId: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <details className="revision-redact">
      <summary>작성자: 이 이전 판 지우기</summary>
      <div className="source-actions" style={{ marginTop: 6 }}>
        <input className="input input-sm" inputMode="numeric" maxLength={4} placeholder="글 비번 4자리" aria-label="글 비밀번호 4자리" value={pw}
          onChange={(e) => setPw(e.target.value.replace(/\D/g, ""))} style={{ width: 120 }} />
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={busy || pw.length !== 4}
          onClick={async () => {
            if (!window.confirm("이 이전 판의 제목·본문·수치를 지웁니다. 되돌릴 수 없습니다. 계속할까요?")) return;
            setBusy(true);
            setMsg(null);
            try {
              await api(`/api/posts/${postId}/revisions/${revisionId}`, "DELETE", { pw });
              router.refresh();
            } catch (e) {
              setMsg((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          지우기
        </button>
      </div>
      {msg && (
        <p className="hint" role="status">
          {msg}
        </p>
      )}
    </details>
  );
}
