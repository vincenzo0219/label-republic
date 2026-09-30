"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { timeAgo } from "@/lib/format";
import type { AliasProposal, BrandInfo } from "@/lib/repo/brand-aliases";

const STATUS: Record<AliasProposal["status"], string> = { open: "의견 받는 중", accepted: "확정", rejected: "기각" };

/**
 * 브랜드 페이지: "같은 브랜드의 다른 표기" 제안·동의 (Sprint 31).
 * 동의가 모이면(정정 제안과 같은 기준) 운영자가 확정하고, 확정·기각은 투명성 기록에 공개된다.
 */
export function BrandAliasPanel({
  brandKey,
  brandLabel,
  initial,
  rule,
}: {
  brandKey: string;
  brandLabel: string;
  initial: AliasProposal[];
  rule: { score: number; ratio: number };
}) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ other: "", reason: "", nickname: "" });
  const [suggest, setSuggest] = useState<BrandInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<{ id: string; msg: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("lr:nickname");
      if (saved) setForm((f) => ({ ...f, nickname: saved }));
    } catch {}
  }, []);

  function onOther(v: string) {
    setForm((f) => ({ ...f, other: v }));
    clearTimeout(timer.current);
    if (!v.trim()) return setSuggest([]);
    timer.current = setTimeout(() => {
      fetch(`/api/brands?q=${encodeURIComponent(v)}`)
        .then((r) => (r.ok ? r.json() : { brands: [] }))
        .then((d: { brands: BrandInfo[] }) => setSuggest(d.brands.filter((b) => b.key !== brandKey)))
        .catch(() => {});
    }, 250);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { proposal } = await api<{ proposal: AliasProposal }>("/api/brand-aliases", "POST", { brandKey, ...form });
      setItems((xs) => [proposal, ...xs]);
      setForm((f) => ({ ...f, other: "", reason: "" }));
      setSuggest([]);
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
      const r = await api<Pick<AliasProposal, "agree_count" | "disagree_count" | "is_supported"> & { my_vote: 1 | -1 | 0 }>(
        `/api/brand-aliases/${id}/vote`,
        "POST",
        { value },
      );
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...r } : x)));
    } catch (err) {
      setVoteError({ id, msg: (err as Error).message });
    }
  }

  return (
    <section aria-labelledby="alias-h">
      <h2 id="alias-h" className="section-h">
        🔗 같은 브랜드의 다른 표기
      </h2>
      <p className="hint" style={{ marginTop: 0 }}>
        &ldquo;NOW Foods&rdquo;와 &ldquo;나우푸드&rdquo;처럼 표기만 다른 같은 브랜드라면 제안해 주세요. 동의 {rule.score}명 이상이고 반대의 {rule.ratio}배 이상이면
        운영자가 확인해 합치고, 결과는 <Link href="/transparency">투명성 기록</Link>에 공개됩니다. 같은 곳(접속 망)에서 낸 표는 한 사람으로 셉니다.
      </p>

      {items.length > 0 && (
        <ul className="alias-list">
          {items.map((p) => {
            const other = p.brand_a === brandKey ? p.label_b : p.brand_b === brandKey ? p.label_a : `${p.label_a} · ${p.label_b}`;
            return (
              <li key={p.id} className="alias-item">
                <div className="alias-head">
                  <b>
                    {brandLabel} = {other}
                  </b>
                  <span className={`badge ${p.status === "accepted" ? "badge-ai" : p.status === "open" && p.is_supported ? "badge-disputed" : "badge-pending"}`}>
                    {p.status === "open" && p.is_supported ? "동의됨 · 운영자 확인 대기" : STATUS[p.status]}
                  </span>
                </div>
                <p className="alias-reason">{p.reason_hidden ? <span className="hint">(권리침해로 운영자가 사유를 가렸어요)</span> : p.reason}</p>
                <p className="hint" style={{ margin: 0 }}>
                  {p.nickname} · <time dateTime={p.created_at} suppressHydrationWarning>{timeAgo(p.created_at)}</time> · 동의 {p.agree_count} · 반대 {p.disagree_count}
                  {p.status === "accepted" && ` · 제품 병합 ${p.merged_products} · 합친 제품 ${p.rekeyed_products}`}
                  {p.resolution_note && ` · 운영자: ${p.resolution_note}`}
                </p>
                {p.status === "open" && (
                  <div className="alias-votes" role="group" aria-label={`${other} 같은 브랜드 제안에 의견`}>
                    <button type="button" className="btn btn-sm" aria-pressed={p.my_vote === 1} onClick={() => vote(p.id, 1)}>
                      👍 같은 브랜드예요
                    </button>
                    <button type="button" className="btn btn-sm" aria-pressed={p.my_vote === -1} onClick={() => vote(p.id, -1)}>
                      👎 다른 브랜드예요
                    </button>
                  </div>
                )}
                {voteError?.id === p.id && <p className="error">{voteError.msg}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {!open ? (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          ＋ 같은 브랜드 제안하기
        </button>
      ) : (
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>{brandLabel}와(과) 같은 브랜드의 다른 표기</span>
            <input className="input" maxLength={60} required value={form.other} onChange={(e) => onOther(e.target.value)} placeholder="예: 나우푸드" autoComplete="off" />
          </label>
          {suggest.length > 0 && (
            <div className="chips" role="group" aria-label="이 사이트에 있는 브랜드">
              {suggest.map((b) => (
                <button key={b.key} type="button" className="chip" aria-pressed={form.other === b.label} onClick={() => (setForm((f) => ({ ...f, other: b.label })), setSuggest([]))}>
                  {b.label} <span className="hint">제품 {b.products}</span>
                </button>
              ))}
            </div>
          )}
          <label className="field">
            <span>같은 브랜드라고 보는 이유</span>
            <textarea className="textarea short" minLength={10} maxLength={500} required value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="예: 공식 한국 수입사 표기이고 제품 라벨의 제조사가 같습니다." />
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
