"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, isNetworkError, requestKeyFor } from "@/lib/client-api";
import { splitMentions } from "@/lib/mentions";
import { addMyComment, watchPost } from "@/lib/watchlist";
import { timeAgo } from "@/lib/format";
import type { Comment } from "@/lib/types";
import { abuseLabel } from "@/lib/abuse-labels";

type Event =
  | { type: "created"; comment: Comment }
  | { type: "deleted"; comment: { id: string | number } }
  // AI 자동 운영이 가리거나 운영자가 풀었을 때 (Sprint 37)
  | { type: "hidden"; comment: { id: string | number; body: string; hidden_reason: string | null } };

/** 소켓·예전 응답에서 온 댓글의 번호를 문자열로, 답글 필드는 빈 값으로 맞춘다 */
const norm = (c: Comment): Comment => ({
  ...c,
  id: String(c.id),
  parent_id: c.parent_id == null ? null : String(c.parent_id),
  mentions: (c.mentions ?? []).map(String),
});

/** 답글은 원 댓글(맨 위 댓글) 아래 한 단계로 모은다 — 답글의 답글도 같은 원 댓글 아래, 누구에게 답했는지 표시 */
function thread(comments: Comment[]): { root: Comment; replies: Comment[] }[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: Comment): Comment => {
    let cur = c;
    for (let i = 0; i < 50 && cur.parent_id && byId.has(cur.parent_id); i++) cur = byId.get(cur.parent_id)!;
    return cur;
  };
  const groups = new Map<string, { root: Comment; replies: Comment[] }>();
  for (const c of comments) {
    const r = rootOf(c);
    if (r.id === c.id) groups.set(c.id, { root: c, replies: groups.get(c.id)?.replies ?? [] });
    else {
      const g = groups.get(r.id) ?? { root: r, replies: [] };
      g.replies.push(c);
      groups.set(r.id, g);
    }
  }
  return [...groups.values()];
}

/**
 * 댓글 목록 + 작성 폼. SSR로 받은 초기 댓글에 WebSocket(/ws/comments) 푸시를 합친다.
 * 소켓이 끊기면 지수 백오프로 재연결하고, 재연결 시 누락분을 REST로 다시 받아 동기화한다.
 */
export function LiveComments({ postId, initial }: { postId: string; initial: Comment[] }) {
  const [comments, setComments] = useState<Comment[]>(() => initial.map(norm));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [form, setForm] = useState({ nickname: "", pw: "", body: "" });
  const [replyTo, setReplyTo] = useState<{ id: string; nickname: string } | null>(null);
  // 리포트·알림의 "#c번호" 링크로 온 댓글 — 앱 안 이동(pushState)에서는 :target 이 바뀌지 않아 직접 강조한다
  const [target, setTarget] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = useRef(0);
  const sending = useRef<{ key: string; sent: string } | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("lr:nickname");
      if (saved) setForm((f) => ({ ...f, nickname: saved }));
    } catch {}
  }, []);

  useEffect(() => {
    const read = () => {
      const m = /^#c(\d{1,18})$/.exec(window.location.hash);
      setTarget(m ? m[1]! : null);
      if (m) requestAnimationFrame(() => document.getElementById(`c${m[1]}`)?.scrollIntoView({ block: "center" }));
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const upsert = (c: Comment) =>
      setComments((list) => (list.some((x) => String(x.id) === String(c.id)) ? list : [...list, norm(c)]));

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws/comments?postId=${postId}`);
      ws.onopen = () => {
        setLive(true);
        if (retry.current > 0) {
          // 끊긴 동안의 댓글 동기화
          api<{ comments: Comment[] }>(`/api/posts/${postId}/comments`, "GET").then((r) => setComments(r.comments.map(norm))).catch(() => {});
        }
        retry.current = 0;
      };
      ws.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data) as Event;
          if (ev.type === "created") {
            upsert(ev.comment);
            setFresh((s) => new Set(s).add(String(ev.comment.id)));
          } else if (ev.type === "deleted") {
            setComments((list) => dropComment(list, String(ev.comment.id)));
          } else if (ev.type === "hidden") {
            const { id, body, hidden_reason } = ev.comment;
            setComments((list) => list.map((c) => (c.id === String(id) ? { ...c, body, hidden_reason } : c)));
          }
        } catch {}
      };
      ws.onclose = () => {
        setLive(false);
        if (stopped) return;
        const delay = Math.min(30_000, 1000 * 2 ** retry.current++);
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [postId]);

  const nicknames = useMemo(() => [...new Set(comments.filter((c) => !c.is_ai_curated).map((c) => c.nickname))], [comments]);
  const groups = useMemo(() => thread(comments), [comments]);
  const byId = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);

  // 본문 끝의 "@글자"에 맞는 이 글의 닉네임 (눌러서 완성)
  const partial = /(?:^|\s)@([^\s@]{0,20})$/.exec(form.body);
  const suggestions = partial
    ? nicknames.filter((n) => n !== form.nickname && n.toLowerCase().startsWith(partial[1]!.toLowerCase()) && n !== partial[1]).slice(0, 5)
    : [];

  function startReply(c: Comment) {
    setReplyTo({ id: c.id, nickname: c.nickname });
    // 답글의 답글이면 누구에게 답하는지 본문에도 (원 댓글 아래에 모여 보이므로)
    if (c.parent_id) setForm((f) => (f.body.includes(`@${c.nickname}`) ? f : { ...f, body: `@${c.nickname} ${f.body}` }));
    bodyRef.current?.focus();
    bodyRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { ...form, ...(replyTo ? { parentId: replyTo.id } : {}) };
    try {
      const { comment, notifyRef } = await api<{ comment: Comment; notifyRef?: string }>(`/api/posts/${postId}/comments`, "POST", payload, {
        idempotencyKey: requestKeyFor(sending, payload),
      });
      sending.current = undefined;
      setComments((list) => (list.some((x) => String(x.id) === String(comment.id)) ? list : [...list, norm(comment)]));
      setForm((f) => ({ ...f, body: "" }));
      setReplyTo(null);
      try {
        window.localStorage.setItem("lr:nickname", form.nickname);
      } catch {}
      // 댓글을 단 글은 자동으로 소식 받기 + 이 댓글에 답글·멘션이 오면 알림
      watchPost(postId);
      if (notifyRef) addMyComment(notifyRef);
    } catch (err) {
      setError(isNetworkError(err) ? "연결이 끊겨 등록 결과를 받지 못했어요. 연결되면 다시 눌러주세요. (두 번 달리지 않아요)" : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const pw = window.prompt("댓글 비밀번호 4자리");
    if (pw === null) return;
    try {
      await api(`/api/comments/${id}`, "DELETE", { pw });
      setComments((list) => dropComment(list, id));
      if (replyTo?.id === id) setReplyTo(null);
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  return (
    <section aria-label="댓글">
      <h2 className="section-title">
        댓글 {comments.length}
        <span className={`live-dot${live ? " on" : ""}`} title={live ? "실시간 연결됨" : "연결 중…"} />
      </h2>
      {comments.length === 0 && <p className="hint">첫 댓글로 팩트를 보태주세요.</p>}
      {groups.map(({ root, replies }) => (
        <div key={root.id} className="comment-thread">
          {[root, ...replies].map((c) => {
            const to = c.parent_id && c.parent_id !== root.id ? byId.get(c.parent_id) : undefined;
            return (
              <div key={c.id} id={`c${c.id}`} className={`comment${c.id !== root.id ? " is-reply" : ""}${fresh.has(c.id) ? " new" : ""}${target === c.id ? " is-target" : ""}`}>
                <div className="comment-head">
                  <b>{c.nickname}</b>
                  {c.is_ai_curated && <span className="badge badge-ai">🤖 AI</span>}
                  <time dateTime={c.created_at} suppressHydrationWarning>{timeAgo(c.created_at)}</time>
                  <span className="spacer" />
                  <button className="linkish" onClick={() => startReply(c)} aria-label={`${c.nickname}님 댓글에 답글`}>답글</button>
                  {!c.is_ai_curated && (
                    <button className="linkish" onClick={() => remove(c.id)}>삭제</button>
                  )}
                </div>
                {to && <div className="comment-to">↳ {to.nickname}님에게</div>}
                {c.hidden_reason ? (
                  <div className="comment-body comment-hidden">
                    🤖 AI 자동 운영이 <b>{abuseLabel(c.hidden_reason)}</b>이(가) 담긴 것으로 판단해 가린 댓글입니다.
                  </div>
                ) : (
                  <div className="comment-body">
                    {splitMentions(c.body, nicknames).map((p, i) => (p.mention ? <span key={i} className="mention">{p.text}</span> : p.text))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <form className="form" onSubmit={submit} style={{ marginTop: 16 }}>
        <div className="row">
          <input className="input" placeholder="닉네임" value={form.nickname} maxLength={20} required
            onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
          <input className="input" placeholder="비번 4자리" inputMode="numeric" pattern="\d{4}" maxLength={4} required
            value={form.pw} onChange={(e) => setForm({ ...form, pw: e.target.value.replace(/\D/g, "") })} />
        </div>
        {replyTo && (
          <div className="reply-banner" role="status">
            ↳ <b>{replyTo.nickname}</b>님에게 답글
            <button type="button" className="linkish" onClick={() => setReplyTo(null)}>답글 취소</button>
          </div>
        )}
        <textarea ref={bodyRef} className="textarea short" maxLength={1000} required
          aria-label={replyTo ? `${replyTo.nickname}님에게 답글` : "댓글"}
          placeholder={replyTo ? "답글을 적어주세요. @닉네임 으로 다른 사람도 부를 수 있어요." : "출처나 측정값을 함께 적어주세요. @닉네임 으로 댓글 작성자를 부를 수 있어요."}
          value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        {suggestions.length > 0 && (
          <div className="mention-suggest" role="group" aria-label="멘션할 닉네임">
            {suggestions.map((n) => (
              <button key={n} type="button" className="chip"
                onClick={() => {
                  setForm((f) => ({ ...f, body: f.body.replace(/@([^\s@]{0,20})$/, `@${n} `) }));
                  bodyRef.current?.focus();
                }}>
                @{n}
              </button>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "등록 중…" : replyTo ? "답글 등록" : "댓글 등록"}</button>
      </form>
    </section>
  );
}

/** 지워진 댓글을 빼고, 그 댓글에 단 답글은 서버처럼 원 댓글 없는 댓글로 */
function dropComment(list: Comment[], id: string): Comment[] {
  return list.filter((c) => c.id !== id).map((c) => (c.parent_id === id ? { ...c, parent_id: null } : c));
}
