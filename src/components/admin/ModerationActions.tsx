"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

const PUBLIC_NOTE = "공개 메모 (신고인·개인정보를 적지 마세요)";

/** 조치 실행 공통: 확인 → POST → 새로고침. 결과·오류 메시지를 돌려준다 */
function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(confirmText: string, body: Record<string, unknown>, done: (r: Record<string, unknown>) => string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<Record<string, unknown>>("/api/admin/moderation", "POST", body);
      setMsg(done(r));
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { msg, setMsg, busy, run };
}

/** 어뷰징 알림: 무효화 대상 미리보기 → 무효화(공개 기록) 또는 오탐으로 닫기(내부 기록) */
export function AlertActions({ alertId }: { alertId: string }) {
  const { msg, setMsg, busy, run } = useAction();
  const [note, setNote] = useState("");
  const [count, setCount] = useState<number | null>(null);

  async function preview() {
    setMsg(null);
    try {
      const r = await api<{ count: number }>(`/api/admin/moderation/preview?alertId=${alertId}`, "GET");
      setCount(r.count);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="mod-actions">
      {count === null ? (
        <button type="button" className="btn btn-sm" onClick={preview}>
          무효화 대상 보기
        </button>
      ) : (
        <>
          <input className="input input-sm" maxLength={300} placeholder={PUBLIC_NOTE} aria-label="공개 메모" value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={busy || count === 0}
            onClick={() =>
              run(
                `조작으로 탐지된 ${count}건을 무효화하고 자동 규칙을 다시 적용합니다. 투명성 기록에 공개됩니다. 계속할까요?`,
                { action: "void_alert", alertId, note },
                (r) => `${r.affected}건 무효화 완료`,
              )
            }
          >
            {count}건 무효화
          </button>
        </>
      )}
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() => run("아무것도 바꾸지 않고 오탐으로 닫습니다. 계속할까요?", { action: "dismiss_alert", alertId, note }, () => "오탐으로 닫음")}
      >
        오탐으로 닫기
      </button>
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}

/** AI 광고 의심 오탐 해제 */
export function ReleaseSuppression({ postId }: { postId: string }) {
  const { msg, busy, run } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="mod-actions">
      <input className="input input-sm" maxLength={300} placeholder={PUBLIC_NOTE} aria-label="공개 메모" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() =>
          run(`글 #${postId}의 광고 의심 표시를 해제합니다. 투명성 기록에 공개됩니다. 계속할까요?`, { action: "release_suppression", postId, note }, () => "해제 완료")
        }
      >
        광고 의심 해제
      </button>
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}

/** 재검토 요청 기각 (사유 필수, 공개) */
export function RejectAppeal({ postId }: { postId: string }) {
  const { msg, busy, run } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="mod-actions">
      <input className="input input-sm" maxLength={300} placeholder="기각 사유 (공개됨)" aria-label="기각 사유" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy || !note.trim()}
        onClick={() => run(`글 #${postId}의 재검토 요청을 기각합니다. 사유가 공개됩니다. 계속할까요?`, { action: "reject_appeal", postId, note }, () => "기각 완료")}
      >
        기각
      </button>
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}

const REJECT_REASONS: [string, string][] = [
  ["illegal", "불법·유해 주제"],
  ["spam", "광고·스팸"],
  ["personal", "특정인 대상·개인정보"],
];

/** 보드 개설 요청 거절·병합 */
export function BoardRequestActions({ requestId, others }: { requestId: string; others: { id: string; name: string }[] }) {
  const { msg, busy, run } = useAction();
  const [reason, setReason] = useState("illegal");
  const [into, setInto] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="mod-actions">
      <input className="input input-sm" maxLength={300} placeholder={PUBLIC_NOTE} aria-label="공개 메모" value={note} onChange={(e) => setNote(e.target.value)} />
      <select className="select input-sm" aria-label="거절 사유" value={reason} onChange={(e) => setReason(e.target.value)}>
        {REJECT_REASONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-sm btn-danger"
        disabled={busy}
        onClick={() =>
          run(`보드 요청 #${requestId}을(를) 거절합니다. 투명성 기록에 공개됩니다. 계속할까요?`, { action: "reject_board_request", requestId, reason, note }, () => "거절 완료")
        }
      >
        거절
      </button>
      {others.length > 0 && (
        <>
          <select className="select input-sm" aria-label="병합할 요청" value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">병합 대상 선택</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.id} {o.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || !into}
            onClick={() =>
              run(
                `요청 #${requestId}의 표를 #${into}(으)로 옮기고 닫습니다. 투명성 기록에 공개됩니다. 계속할까요?`,
                { action: "merge_board_request", requestId, intoId: into, note },
                (r) => `병합 완료 · #${into} ${r.voteCount}표`,
              )
            }
          >
            병합
          </button>
        </>
      )}
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}
