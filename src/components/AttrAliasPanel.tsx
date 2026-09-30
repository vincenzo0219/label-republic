"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { timeAgo } from "@/lib/format";
import type { AttrAlias, AttrAliasProposal, AttrVoteResult } from "@/lib/repo/attr-aliases";

const STATUS: Record<AttrAliasProposal["status"], string> = { open: "의견 받는 중", accepted: "확정", rejected: "기각" };

/**
 * 성분 순위 화면: "같은 성분의 다른 이름" 목록과 제안·동의 (Sprint 35).
 * 동의가 모이면(정정 제안과 같은 기준) 운영자가 확정하고, 확정·기각·해제는 투명성 기록에 공개된다.
 */
export function AttrAliasPanel({
  board,
  attrKey,
  attrLabel,
  aliases,
  others,
  initial,
  rule,
}: {
  board: string;
  attrKey: string;
  attrLabel: string;
  aliases: AttrAlias[];
  /** 같은 보드의 다른 항목 (제안 칸의 고르기) */
  others: { key: string; label: string; products: number }[];
  initial: AttrAliasProposal[];
  rule: { score: number; ratio: number };
}) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ other: "", reason: "", nickname: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("lr:nickname");
      if (saved) setForm((f) => ({ ...f, nickname: saved }));
    } catch {}
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { proposal } = await api<{ proposal: AttrAliasProposal }>("/api/attr-aliases", "POST", { board, attrKey, ...form });
      setItems((xs) => [proposal, ...xs]);
      setForm((f) => ({ ...f, other: "", reason: "" }));
      setOpen(false);
      try {
        window.localStorage.setItem("lr:nickname", form.nickname);
      } catch {}
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function vote(id: string, value: 1 | -1) {
    setVoteError(null);
    try {
      const r = await api<AttrVoteResult>(`/api/attr-aliases/${id}/vote`, "POST", { value });
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...r } : x)));
    } catch (err) {
      setVoteError({ id, msg: (err as Error).message });
    }
  }

  return (
    <section aria-labelledby="attr-alias-h">
      <h2 id="attr-alias-h" className="section-h">
        🔗 같은 성분의 다른 이름
      </h2>
      {aliases.length > 0 ? (
        <p className="hint" style={{ marginTop: 0 }}>
          이 순위에는 다음 이름으로 적힌 수치도 함께 들어 있어요:{" "}
          {aliases.map((a, i) => (
            <span key={a.key}>
              {i > 0 && " · "}
              <b>{a.label}</b>
              {a.builtin && <span className="hint"> (기본 사전)</span>}
            </span>
          ))}
        </p>
      ) : null}
      <p className="hint" style={{ marginTop: 0 }}>
        &ldquo;비타민 D3&rdquo;와 &ldquo;콜레칼시페롤&rdquo;처럼 이름만 다른 같은 성분·스펙이 따로 모여 있다면 제안해 주세요. 동의 {rule.score}명 이상이고 반대의 {rule.ratio}
        배 이상이면 운영자가 확인해 합치고, 결과는 <Link href="/transparency">투명성 기록</Link>에 공개됩니다. 같은 곳(접속 망)에서 낸 표는 한 사람으로 셉니다. 형태에 따라
        함량 기준이 달라지는 성분(예: 엽산과 DFE)은 합치지 말아 주세요.
      </p>

      {items.length > 0 && (
        <ul className="alias-list">
          {items.map((p) => {
            const other = p.attr_a === attrKey ? p.label_b : p.attr_b === attrKey ? p.label_a : `${p.label_a} · ${p.label_b}`;
            return (
              <li key={p.id} className="alias-item">
                <div className="alias-head">
                  <b>
                    {attrLabel} = {other}
                  </b>
                  <span className={`badge ${p.status === "accepted" ? "badge-ai" : p.status === "open" && p.is_supported ? "badge-disputed" : "badge-pending"}`}>
                    {p.status === "open" && p.is_supported ? "동의됨 · 운영자 확인 대기" : STATUS[p.status]}
                  </span>
                </div>
                <p className="alias-reason">{p.reason_hidden ? <span className="hint">(권리침해로 운영자가 사유를 가렸어요)</span> : p.reason}</p>
                <p className="hint" style={{ margin: 0 }}>
                  {p.nickname} · <time dateTime={p.created_at} suppressHydrationWarning>{timeAgo(p.created_at)}</time> · 동의 {p.agree_count} · 반대 {p.disagree_count}
                  {p.status === "accepted" && ` · 합친 수치 ${p.rekeyed_facts}`}
                  {p.resolution_note && ` · 운영자: ${p.resolution_note}`}
                </p>
                {p.status === "open" && (
                  <div className="alias-votes" role="group" aria-label={`${other} 같은 성분 제안에 의견`}>
                    <button type="button" className="btn btn-sm" aria-pressed={p.my_vote === 1} onClick={() => vote(p.id, 1)}>
                      👍 같은 성분이에요
                    </button>
                    <button type="button" className="btn btn-sm" aria-pressed={p.my_vote === -1} onClick={() => vote(p.id, -1)}>
                      👎 다른 성분이에요
                    </button>
                  </div>
                )}
                {voteError?.id === p.id && <p className="error">{voteError.msg}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {others.length === 0 ? null : !open ? (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          ＋ 같은 성분 제안하기
        </button>
      ) : (
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>{attrLabel}와(과) 같은 성분인 항목</span>
            <select className="select" required value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })}>
              <option value="">고르세요</option>
              {others.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} (제품 {o.products})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>같은 성분이라고 보는 이유</span>
            <textarea className="textarea short" minLength={10} maxLength={500} required value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="예: 콜레칼시페롤은 비타민 D3 의 성분명이고 라벨에 둘 다 적혀 있습니다." />
          </label>
          <label className="field">
            <span>닉네임</span>
            <input className="input" maxLength={20} required value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
          </label>
          {error && <p className="error">{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "올리는 중…" : "제안 올리기"}</button>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              취소
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
