"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, isNetworkError, requestKeyFor } from "@/lib/client-api";
import { STATUS_LABEL, TARGET_LABEL, type CorrectionTarget } from "@/lib/corrections";
import { formatRule } from "@/lib/rules";
import { timeAgo } from "@/lib/format";
import { watchPost } from "@/lib/watchlist";
import { displayHost, SOURCE_KIND_LABEL } from "@/lib/sources";
import type { Correction } from "@/lib/types";

type Props = {
  postId: string;
  /** 글의 수치 (정정할 수치 고르기용 표기) */
  facts: string[];
  initial: { items: Correction[]; hidden: number };
  /** AI 큐레이터 글은 작성자 응답이 없다 */
  hasAuthor: boolean;
  /** 커뮤니티 규칙 값 (투표로 바뀔 수 있음) */
  rules: { supportScore: number; supportRatio: number; hideReports: number };
};

/**
 * 정정 제안: 무엇이 틀렸고(인용·수치) 어떻게 고쳐야 하며 근거는 무엇인지 구조화해서 단다.
 * 판정은 방장이 아니라 동의·반대와 자동 규칙이 한다.
 */
export function CorrectionsPanel({ postId, facts, initial, hasAuthor, rules }: Props) {
  const [items, setItems] = useState(initial.items);
  const [open, setOpen] = useState(false);
  const replace = (c: Correction) => setItems((xs) => xs.map((x) => (x.id === c.id ? c : x)));
  const visible = items.filter((c) => c.status !== "withdrawn");
  const withdrawn = items.length - visible.length;

  return (
    <section className="corrections" id="corrections" aria-labelledby="corrections-h">
      <div className="corrections-head">
        <h2 id="corrections-h">🛠 정정 제안 {visible.length > 0 && visible.length}</h2>
        {!open && (
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            ✍ 정정 제안하기
          </button>
        )}
      </div>
      <p className="hint">
        틀린 수치·문장을 근거와 함께 제안해 주세요. 동의가 모이면(동의 {formatRule("correction_support_score", rules.supportScore)}점 이상, 반대의 {formatRule("correction_support_ratio", rules.supportRatio)}배 이상 — <a href="/rules">커뮤니티 규칙</a>) 글 위에 표시되고, 그 수치는 제품 페이지 집계에서
        빠지며, 신뢰도 상위 배지를 받지 못합니다. 작성자가 글을 고치고 &ldquo;반영함&rdquo;을 누르면 닫힙니다.
      </p>
      {open && (
        <CorrectionForm
          postId={postId}
          facts={facts}
          onCancel={() => setOpen(false)}
          onCreated={(c) => {
            setItems((xs) => [c, ...xs]);
            setOpen(false);
            // 내 제안이 달린 글은 자동으로 소식 받기 (동의·반영·답변을 📬 로)
            watchPost(postId);
          }}
        />
      )}
      {visible.length > 0 && (
        <ol className="correction-list">
          {visible.map((c) => (
            <CorrectionItem key={c.id} c={c} hasAuthor={hasAuthor} hideReports={rules.hideReports} onChange={replace} />
          ))}
        </ol>
      )}
      {(withdrawn > 0 || initial.hidden > 0) && (
        <p className="hint">
          {withdrawn > 0 && `철회된 제안 ${withdrawn}건`}
          {withdrawn > 0 && initial.hidden > 0 && " · "}
          {initial.hidden > 0 && `신고 누적으로 가려진 제안 ${initial.hidden}건`}
        </p>
      )}
    </section>
  );
}

function CorrectionItem({ c, hasAuthor, hideReports, onChange }: { c: Correction; hasAuthor: boolean; hideReports: number; onChange: (c: Correction) => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [note, setNote] = useState("");
  const closed = c.status === "applied" || c.status === "withdrawn";

  async function run<T>(fn: () => Promise<T>, done: (r: T) => void) {
    setBusy(true);
    setMsg(null);
    try {
      done(await fn());
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const vote = (value: 1 | -1) =>
    run(
      () => api<Pick<Correction, "agree_count" | "disagree_count" | "is_supported" | "my_vote">>(`/api/corrections/${c.id}/vote`, "POST", { value }),
      (r) => onChange({ ...c, ...r }),
    );
  const act = (path: string, body: object) => run(() => api<{ correction: Correction }>(`/api/corrections/${c.id}/${path}`, "POST", body), (r) => onChange(r.correction));

  return (
    <li id={`correction-${c.id}`} className={c.is_supported && !closed ? "correction is-supported" : "correction"}>
      <div className="correction-top">
        <span className={`badge badge-cstatus-${c.status}`}>{STATUS_LABEL[c.status]}</span>
        {c.is_supported && !closed && <span className="badge badge-disputed">✔ 커뮤니티 동의</span>}
        <span>
          {TARGET_LABEL[c.target]} · {c.nickname} · <time dateTime={c.created_at} suppressHydrationWarning>{timeAgo(c.created_at)}</time>
        </span>
      </div>
      <blockquote className="correction-quote">
        {c.quote}
        {!c.target_current && c.target !== "other" && <span className="hint"> (지금 글에서는 바뀜)</span>}
      </blockquote>
      <p className="correction-proposal">
        <span aria-hidden="true">→ </span>
        <span className="sr-only">제안: </span>
        {c.proposal}
      </p>
      <p className="correction-reason">{c.reason}</p>
      {c.source_url && (
        <p className="correction-source">
          <span className={`badge badge-src badge-src-${c.source_kind}`}>{SOURCE_KIND_LABEL[c.source_kind!]}</span>{" "}
          <a href={c.source_url} target="_blank" rel="nofollow ugc noopener noreferrer">
            {displayHost(c.source_host!)}
          </a>
        </p>
      )}
      {c.author_note && (
        <p className="author-note">
          ✍ 작성자{c.status === "applied" ? " 반영 메모" : " 답변"}: {c.author_note}
        </p>
      )}
      <div className="correction-actions">
        <div className="correction-votes" role="group" aria-label="정정 제안 동의·반대">
          <button type="button" className="btn btn-sm" aria-pressed={c.my_vote === 1} disabled={busy || closed} onClick={() => vote(1)}>
            👍 동의 {c.agree_count}
          </button>
          <button type="button" className="btn btn-sm" aria-pressed={c.my_vote === -1} disabled={busy || closed} onClick={() => vote(-1)}>
            👎 반대 {c.disagree_count}
          </button>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={() => window.confirm(`이 정정 제안을 신고할까요? 고유 신고 ${hideReports}건이면 자동으로 가려집니다.`) && run(() => api(`/api/corrections/${c.id}/report`, "POST", {}), () => setMsg("신고했습니다."))}
        >
          신고
        </button>
      </div>
      {!closed && (
        <details className="correction-manage">
          <summary>작성자·제안자 메뉴</summary>
          <div className="correction-manage-body">
            <input className="input input-sm" inputMode="numeric" maxLength={4} placeholder="비번 4자리" aria-label="비밀번호 4자리" value={pw}
              onChange={(e) => setPw(e.target.value.replace(/\D/g, ""))} />
            {hasAuthor && (
              <>
                <input className="input input-sm" maxLength={300} placeholder="작성자 메모·답변" aria-label="작성자 메모·답변" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="source-actions">
                  <button type="button" className="btn btn-sm" disabled={busy || pw.length !== 4} onClick={() => act("respond", { pw, action: "applied", note })}>
                    ✅ 글을 고쳤어요 (반영함)
                  </button>
                  <button type="button" className="btn btn-sm" disabled={busy || pw.length !== 4} onClick={() => act("respond", { pw, action: "answered", note })}>
                    💬 반영하지 않는 이유 답변
                  </button>
                </div>
              </>
            )}
            <button type="button" className="btn btn-sm btn-danger" disabled={busy || pw.length !== 4} onClick={() => act("withdraw", { pw })}>
              제안 철회 (제안자)
            </button>
            <span className="hint">글 작성자는 글 비밀번호, 제안자는 제안할 때 정한 비밀번호를 넣으세요.</span>
          </div>
        </details>
      )}
      {msg && (
        <p className="hint" role="status">
          {msg}
        </p>
      )}
    </li>
  );
}

function CorrectionForm({ postId, facts, onCancel, onCreated }: { postId: string; facts: string[]; onCancel: () => void; onCreated: (c: Correction) => void }) {
  const [target, setTarget] = useState<CorrectionTarget>(facts.length ? "fact" : "text");
  const [factIndex, setFactIndex] = useState(0);
  const [quote, setQuote] = useState("");
  const [proposal, setProposal] = useState("");
  const [reason, setReason] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [nickname, setNickname] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sending = useRef<{ key: string; sent: string } | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("lr:nickname");
      if (saved) setNickname(saved);
    } catch {}
  }, []);

  const targets = (Object.keys(TARGET_LABEL) as CorrectionTarget[]).filter((t) => t !== "fact" || facts.length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { nickname, pw, target, proposal, reason, sourceUrl, ...(target === "fact" ? { factIndex } : { quote }) };
      const { correction } = await api<{ correction: Correction }>(`/api/posts/${postId}/corrections`, "POST", payload, {
        idempotencyKey: requestKeyFor(sending, payload),
      });
      sending.current = undefined;
      try {
        window.localStorage.setItem("lr:nickname", nickname);
      } catch {}
      onCreated(correction);
    } catch (err) {
      setError(isNetworkError(err) ? "연결이 끊겨 등록 결과를 받지 못했어요. 연결되면 다시 눌러주세요. (두 번 올라가지 않아요)" : (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form correction-form" onSubmit={submit} aria-label="정정 제안 작성">
      <div className="chips" role="radiogroup" aria-label="정정할 부분">
        {targets.map((t) => (
          <button type="button" key={t} role="radio" aria-checked={target === t} className="chip chip-sm" onClick={() => setTarget(t)}>
            {TARGET_LABEL[t]}
          </button>
        ))}
      </div>
      {target === "fact" ? (
        <label className="field">
          <span>틀린 수치</span>
          <select className="select" value={factIndex} onChange={(e) => setFactIndex(Number(e.target.value))}>
            {facts.map((f, i) => (
              <option key={i} value={i}>
                {f}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="field">
          <span>{target === "text" ? "틀린 문장 (본문에서 그대로 복사)" : "어느 부분인가요? (예: 제목, 2번째 사진 설명, 출처 링크)"}</span>
          <textarea className="input" rows={2} maxLength={300} required value={quote} onChange={(e) => setQuote(e.target.value)} />
          {target === "text" && (
            <button
              type="button"
              className="btn btn-sm"
              style={{ justifySelf: "start" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const sel = window.getSelection()?.toString().trim();
                if (sel) setQuote(sel.slice(0, 300));
                else setError("본문에서 문장을 드래그해 선택한 뒤 눌러주세요.");
              }}
            >
              본문에서 선택한 문장 가져오기
            </button>
          )}
        </label>
      )}
      <label className="field">
        <span>이렇게 고쳐야 해요</span>
        <input className="input" maxLength={300} required placeholder="예: 1정당 마그네슘 100mg (라벨 뒷면 기준)" value={proposal} onChange={(e) => setProposal(e.target.value)} />
      </label>
      <label className="field">
        <span>근거 (10자 이상)</span>
        <textarea className="input" rows={3} maxLength={1000} required placeholder="어떻게 확인했는지 적어주세요. 라벨 사진, 제조사 스펙, 논문 등" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="field">
        <span>근거 링크 (선택)</span>
        <input className="input" inputMode="url" maxLength={600} placeholder="https://…" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
      </label>
      <div className="row">
        <input className="input" placeholder="닉네임" aria-label="정정 제안 닉네임" maxLength={20} required value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <input className="input" placeholder="비번 4자리" aria-label="정정 제안 비밀번호" inputMode="numeric" pattern="\d{4}" maxLength={4} required value={pw}
          onChange={(e) => setPw(e.target.value.replace(/\D/g, ""))} />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="source-actions">
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "올리는 중…" : "정정 제안 올리기"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
