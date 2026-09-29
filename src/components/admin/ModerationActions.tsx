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

/** 중복 제품 병합 — 후보 쌍에서 방향을 고르거나, 번호를 직접 입력 */
export function ProductMergeActions({ a, b }: { a?: { id: string; label: string }; b?: { id: string; label: string } }) {
  const { msg, busy, run } = useAction();
  const [note, setNote] = useState("");
  const [from, setFrom] = useState("");
  const [into, setInto] = useState("");
  const merge = (fromId: string, intoId: string, desc: string) =>
    run(
      `${desc}\n글 태그와 수치를 옮기고 원래 제품 주소는 합쳐진 제품으로 이어집니다. 투명성 기록에 공개됩니다. 계속할까요?`,
      { action: "merge_product", productId: fromId, intoId, note },
      (r) => `병합 완료 · 글 ${r.moved}개 이동`,
    );
  return (
    <div className="mod-actions">
      <input className="input input-sm" maxLength={300} placeholder={PUBLIC_NOTE} aria-label="공개 메모" value={note} onChange={(e) => setNote(e.target.value)} />
      {a && b ? (
        <>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => merge(a.id, b.id, `제품 #${a.id}를 #${b.id}(${b.label})로 합칩니다.`)}>
            #{a.id} → #{b.id}
          </button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => merge(b.id, a.id, `제품 #${b.id}를 #${a.id}(${a.label})로 합칩니다.`)}>
            #{b.id} → #{a.id}
          </button>
        </>
      ) : (
        <>
          <input className="input input-sm" inputMode="numeric" aria-label="합칠 제품 번호" placeholder="합칠 제품 #" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} style={{ flex: "0 1 120px" }} />
          <input className="input input-sm" inputMode="numeric" aria-label="남길 제품 번호" placeholder="남길 제품 #" value={into} onChange={(e) => setInto(e.target.value.replace(/\D/g, ""))} style={{ flex: "0 1 120px" }} />
          <button type="button" className="btn btn-sm" disabled={busy || !from || !into} onClick={() => merge(from, into, `제품 #${from}를 #${into}로 합칩니다.`)}>
            병합
          </button>
        </>
      )}
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}

/** 브랜드 별칭 제안 확정·기각·사유 가림 (Sprint 31·33) — 확정은 커뮤니티 동의를 얻은 제안만, 대표 브랜드는 운영자가 바꿀 수 있다 */
export function BrandAliasActions({
  proposalId,
  supported,
  pair,
  plan,
}: {
  proposalId: string;
  supported: boolean;
  pair: string;
  plan: { canonical: string; alias: string; canonicalLabel: string; aliasLabel: string; rekey: number; merges: unknown[] } | null;
}) {
  const { msg, busy, run } = useAction();
  const [note, setNote] = useState("");
  const accept = (canonical: string, into: string, from: string) =>
    run(
      `${pair}\n${from} → ${into}(대표)로 확정합니다. ${plan ? `같은 이름 제품 ${plan.merges.length}개는 병합되어 되돌릴 수 없습니다. ` : ""}투명성 기록에 공개됩니다. 계속할까요?`,
      { action: "accept_brand_alias", proposalId, note, canonical },
      (r) => `확정 · 제품 병합 ${r.merged} · 합친 제품 ${r.rekeyed}`,
    );
  return (
    <div className="mod-actions">
      <input className="input input-sm" maxLength={300} placeholder={PUBLIC_NOTE} aria-label="공개 메모" value={note} onChange={(e) => setNote(e.target.value)} />
      {plan && (
        <>
          <button type="button" className="btn btn-sm" disabled={busy || !supported} title={supported ? undefined : "커뮤니티 동의를 얻은 제안만 확정할 수 있습니다"}
            onClick={() => accept(plan.canonical, plan.canonicalLabel, plan.aliasLabel)}>
            확정 ({plan.canonicalLabel} 대표)
          </button>
          <button type="button" className="btn btn-sm" disabled={busy || !supported} onClick={() => accept(plan.alias, plan.aliasLabel, plan.canonicalLabel)}>
            {plan.aliasLabel} 대표로 확정
          </button>
        </>
      )}
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy || !note.trim()}
        onClick={() => run(`${pair}\n제안을 기각합니다 (사유 공개). 계속할까요?`, { action: "reject_brand_alias", proposalId, note }, () => "기각했습니다")}
      >
        기각
      </button>
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy || !note.trim()}
        onClick={() => run(`${pair}\n제안 사유만 가립니다 (제안·투표는 그대로, 공개 기록). 계속할까요?`, { action: "hide_brand_alias_reason", proposalId, note }, () => "사유를 가렸습니다")}
      >
        사유 가림
      </button>
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}

/** 확정된 브랜드 별칭 해제 — 잘못 확정했을 때. 키만 바꾼 제품은 되돌리고, 병합된 제품은 그대로 */
export function BrandAliasRemove({ aliasKey, pair }: { aliasKey: string; pair: string }) {
  const { msg, busy, run } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="mod-actions">
      <input className="input input-sm" maxLength={300} placeholder="해제 사유 (공개)" aria-label="해제 사유" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy || !note.trim()}
        onClick={() => run(`${pair}\n별칭을 해제합니다. 확정 때 병합된 제품은 되돌리지 않습니다. 계속할까요?`, { action: "remove_brand_alias", aliasKey, note }, (r) => `해제 · 되돌린 제품 ${r.restored}`)}
      >
        해제
      </button>
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}
