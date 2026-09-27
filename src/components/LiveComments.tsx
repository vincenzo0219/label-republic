"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { timeAgo } from "@/lib/format";
import type { Comment } from "@/lib/types";

type Event = { type: "created"; comment: Comment } | { type: "deleted"; comment: { id: string | number } };

/**
 * 댓글 목록 + 작성 폼. SSR로 받은 초기 댓글에 WebSocket(/ws/comments) 푸시를 합친다.
 * 소켓이 끊기면 지수 백오프로 재연결하고, 재연결 시 누락분을 REST로 다시 받아 동기화한다.
 */
export function LiveComments({ postId, initial }: { postId: string; initial: Comment[] }) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [form, setForm] = useState({ nickname: "", pw: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = useRef(0);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("lr:nickname");
      if (saved) setForm((f) => ({ ...f, nickname: saved }));
    } catch {}
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const upsert = (c: Comment) =>
      setComments((list) => (list.some((x) => String(x.id) === String(c.id)) ? list : [...list, { ...c, id: String(c.id) }]));

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws/comments?postId=${postId}`);
      ws.onopen = () => {
        setLive(true);
        if (retry.current > 0) {
          // 끊긴 동안의 댓글 동기화
          api<{ comments: Comment[] }>(`/api/posts/${postId}/comments`, "GET").then((r) => setComments(r.comments)).catch(() => {});
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
            setComments((list) => list.filter((c) => String(c.id) !== String(ev.comment.id)));
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { comment } = await api<{ comment: Comment }>(`/api/posts/${postId}/comments`, "POST", form);
      setComments((list) => (list.some((x) => String(x.id) === String(comment.id)) ? list : [...list, comment]));
      setForm((f) => ({ ...f, body: "" }));
      try {
        window.localStorage.setItem("lr:nickname", form.nickname);
      } catch {}
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const pw = window.prompt("댓글 비밀번호 4자리");
    if (pw === null) return;
    try {
      await api(`/api/comments/${id}`, "DELETE", { pw });
      setComments((list) => list.filter((c) => String(c.id) !== id));
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
      {comments.map((c) => (
        <div key={c.id} className={`comment${fresh.has(String(c.id)) ? " new" : ""}`}>
          <div className="comment-head">
            <b>{c.nickname}</b>
            <time dateTime={c.created_at} suppressHydrationWarning>{timeAgo(c.created_at)}</time>
            <span className="spacer" />
            <button className="linkish" onClick={() => remove(String(c.id))}>삭제</button>
          </div>
          <div className="comment-body">{c.body}</div>
        </div>
      ))}

      <form className="form" onSubmit={submit} style={{ marginTop: 16 }}>
        <div className="row">
          <input className="input" placeholder="닉네임" value={form.nickname} maxLength={20} required
            onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
          <input className="input" placeholder="비번 4자리" inputMode="numeric" pattern="\d{4}" maxLength={4} required
            value={form.pw} onChange={(e) => setForm({ ...form, pw: e.target.value.replace(/\D/g, "") })} />
        </div>
        <textarea className="textarea short" placeholder="출처나 측정값을 함께 적어주면 신뢰도가 올라가요." maxLength={1000} required
          value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "등록 중…" : "댓글 등록"}</button>
      </form>
    </section>
  );
}
