"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

/** 규칙 제안 이유에 권리침해가 있을 때만 — 사유를 적으면 투명성 기록에 공개된다 */
export function HideRuleReason({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-danger"
        onClick={async () => {
          const note = window.prompt("가리는 이유 (투명성 기록에 공개됩니다. 신고인·개인정보를 적지 마세요)");
          if (!note?.trim()) return;
          try {
            await api("/api/admin/moderation", "POST", { action: "hide_rule_reason", proposalId: id, note });
            router.refresh();
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        이유 가림
      </button>
      {msg && (
        <span className="error" role="alert">
          {msg}
        </span>
      )}
    </>
  );
}
