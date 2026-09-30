"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, isNetworkError, requestKeyFor } from "@/lib/client-api";
import { allowedRange, formatRule, proposalProblem, RULES, type RuleKey } from "@/lib/rules";

/** 찬성·반대·취소 (마감 전까지 바꿀 수 있음) */
export function RuleVoteButtons({ id, mine, canVote, why }: { id: string; mine: 1 | -1 | null; canVote: boolean; why: string | null }) {
  const router = useRouter();
  const [vote, setVote] = useState(mine);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(value: 1 | -1) {
    const next = vote === value ? 0 : value;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/rules/proposals/${id}/vote`, "POST", { value: next });
      setVote(next === 0 ? null : next);
      setMsg(next === 0 ? "표를 취소했어요." : next === 1 ? "찬성했어요. 마감 전까지 바꿀 수 있어요." : "반대했어요. 마감 전까지 바꿀 수 있어요.");
      router.refresh();
    } catch (e) {
      setMsg(isNetworkError(e) ? "연결이 끊겼어요. 다시 눌러주세요." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canVote) return <p className="hint">🗳 {why}</p>;
  return (
    <div className="rule-vote">
      <div className="row-actions" role="group" aria-label="이 제안에 투표">
        <button type="button" className="btn btn-sm" aria-pressed={vote === 1} disabled={busy} onClick={() => send(1)}>
          👍 찬성
        </button>
        <button type="button" className="btn btn-sm" aria-pressed={vote === -1} disabled={busy} onClick={() => send(-1)}>
          👎 반대
        </button>
      </div>
      {msg && (
        <span className="hint" role="status">
          {msg}
        </span>
      )}
    </div>
  );
}

export function WithdrawProposal({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm("이 제안을 철회할까요? 투표가 멈추고 규칙은 그대로입니다.")) return;
    try {
      await api(`/api/rules/proposals/${id}/withdraw`, "POST", { pw });
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }
  if (!open) {
    return (
      <button type="button" className="linkish" onClick={() => setOpen(true)}>
        제안자: 철회
      </button>
    );
  }
  return (
    <form className="row-actions" onSubmit={submit}>
      <input className="input input-sm" aria-label="제안 비밀번호 4자리" placeholder="비번 4자리" inputMode="numeric" pattern="\d{4}" maxLength={4} required value={pw}
        onChange={(e) => setPw(e.target.value.replace(/\D/g, ""))} />
      <button className="btn btn-sm btn-danger">철회</button>
      {msg && (
        <span className="error" role="alert">
          {msg}
        </span>
      )}
    </form>
  );
}

/** 규칙 변경 제안 폼 — 안전 범위·한 번에 바꿀 폭 안에서만 */
export function ProposeRule({ ruleKey, current, canPropose, why }: { ruleKey: RuleKey; current: number; canPropose: boolean; why: string | null }) {
  const router = useRouter();
  const def = RULES[ruleKey];
  const range = allowedRange(ruleKey, current);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [nickname, setNickname] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef<{ key: string; sent: string } | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("lr:nickname");
      if (saved) setNickname(saved);
    } catch {}
  }, []);

  const num = Number(value);
  const problem = value.trim() ? proposalProblem(ruleKey, current, num) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!value.trim() || problem) {
      setError(problem ?? "새 값을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const payload = { key: ruleKey, value: num, reason, nickname, pw };
      const { proposal } = await api<{ proposal: { id: string } }>("/api/rules/proposals", "POST", payload, { idempotencyKey: requestKeyFor(sending, payload) });
      sending.current = undefined;
      setOpen(false);
      router.push(`/rules#proposal-${proposal.id}`);
      router.refresh();
    } catch (err) {
      setError(isNetworkError(err) ? "연결이 끊겼어요. 다시 눌러주세요." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return canPropose ? (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        ✍️ 바꾸자고 제안하기
      </button>
    ) : (
      <p className="hint">{why}</p>
    );
  }
  return (
    <form className="form rule-propose" onSubmit={submit} aria-label={`${def.label} 변경 제안`}>
      <label className="field">
        <span>
          새 값 ({formatRule(ruleKey, range.min)}~{formatRule(ruleKey, range.max)}
          {def.unit}, 지금 {formatRule(ruleKey, current)}
          {def.unit})
        </span>
        <input className="input" inputMode="decimal" required value={value} aria-invalid={problem ? true : undefined} onChange={(e) => setValue(e.target.value.trim())} />
      </label>
      {value.trim() && !problem && (
        <p className="hint">{num > current ? `⬆️ ${def.higher}` : `⬇️ ${def.lower}`}</p>
      )}
      <label className="field">
        <span>제안 이유 (20자 이상 — 어떤 일이 있었는지, 글 번호 #123 로 근거를 적어주세요)</span>
        <textarea className="textarea short" required minLength={20} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="row">
        <input className="input" placeholder="닉네임" aria-label="닉네임" maxLength={20} required value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <input className="input" placeholder="비번 4자리 (철회용)" aria-label="비밀번호 4자리 (철회용)" inputMode="numeric" pattern="\d{4}" maxLength={4} required value={pw}
          onChange={(e) => setPw(e.target.value.replace(/\D/g, ""))} />
      </div>
      {(error || problem) && (
        <p className="error" role="alert">
          {error ?? problem}
        </p>
      )}
      <div className="row-actions">
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "올리는 중…" : "제안하고 투표 시작"}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          취소
        </button>
      </div>
      <p className="hint">제안하면 7일 동안 투표가 열리고, 제안한 사람은 찬성으로 셉니다. 제안은 일주일에 한 번까지 할 수 있어요.</p>
    </form>
  );
}
