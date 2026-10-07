"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

const LABEL = { threads: "🧵 스레드", instagram: "📷 인스타" } as const;

/**
 * 승인 대기함 위의 SNS 연결 (Sprint 53). Meta 개발자 앱의 "사용자 토큰 생성기"에서 받은 토큰을 붙여넣으면
 * 서버가 그 토큰으로 계정 이름을 읽어 확인한 뒤 저장한다. 화면에 토큰을 다시 보여 주지 않는다.
 */
export function SocialConnect({ platform, ready, account, expiresAt }: { platform: "threads" | "instagram"; ready: boolean; account: string; expiresAt: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(!ready);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ account: string }>("/api/admin/social", "POST", { platform, token });
      setToken("");
      setMsg(`연결됐어요${r.account ? ` (@${r.account})` : ""}`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="social-connect">
      <span>
        <b>{LABEL[platform]}</b>{" "}
        {ready ? (
          <>
            ✅ 연결됨{account && ` · @${account}`}
            {expiresAt && <span className="hint"> · 토큰은 서버가 자동 갱신</span>}
          </>
        ) : (
          <span className="hint">아직 연결 안 됨 — 복사해서 직접 올리기</span>
        )}
      </span>
      {!open && (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          {ready ? "토큰 바꾸기" : "연결하기"}
        </button>
      )}
      {open && (
        <form className="social-connect-form" onSubmit={save}>
          <input
            className="input input-sm"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Meta 토큰 생성기에서 복사한 토큰"
            aria-label={`${LABEL[platform]} 액세스 토큰`}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" disabled={busy || token.trim().length < 20}>
            확인하고 저장
          </button>
        </form>
      )}
      {msg && (
        <span className="hint" role="status">
          {msg}
        </span>
      )}
    </div>
  );
}
