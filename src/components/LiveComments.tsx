"use client";

import { badgeOf, type BadgeMap } from "@/lib/badges";
import { NickBadge } from "./NickBadge";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, isNetworkError, requestKeyFor } from "@/lib/client-api";
import { splitMentions } from "@/lib/mentions";
import { addMyComment, watchPost } from "@/lib/watchlist";
import { timeAgo } from "@/lib/format";
import type { Comment } from "@/lib/types";
import { abuseLabel } from "@/lib/abuse-labels";
import { imageUrl, thumbUrl } from "@/lib/media-url";
import { shrinkIfNeeded, upload } from "./ImagePicker";
import { myNick, myPin, saveNick, withMyPin } from "@/lib/me";
import { NickCheck } from "./NickCheck";
import { EAR_BRAG_POST_ID, earBragLine } from "@/lib/earTest";
import { HEARING_BRAG_POST_ID, hearingBragLine } from "@/lib/hearingTest";

type Event =
  | { type: "created"; comment: Comment }
  | { type: "deleted"; comment: { id: string | number } }
  // AI 자동 운영이 가리거나 운영자가 풀었을 때 (Sprint 37)
  | { type: "hidden"; comment: { id: string | number; body: string; hidden_reason: string | null; image_id?: string | null } };

const LIKES_KEY = "lr:likes";

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
/** casual: 잡담·정모 글 — 출처·측정값을 요구하지 않는 말투로 안내한다 */
/** ensurePost: 아직 글이 없는 화면(📍 동네 체험)에서 첫 댓글을 보낼 때 글을 만들고 번호를 돌려준다. postId 는 "" */
export function LiveComments({ postId: initialPostId, initial, casual = false, chat = false, badges, ensurePost }: { postId: string; initial: Comment[]; casual?: boolean; chat?: boolean; badges?: BadgeMap; ensurePost?: () => Promise<string> }) {
  const [postId, setPostId] = useState(initialPostId);
  const [comments, setComments] = useState<Comment[]>(() => initial.map(norm));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [form, setForm] = useState({ nickname: "", pw: "", body: "" });
  const [replyTo, setReplyTo] = useState<{ id: string; nickname: string } | null>(null);
  // 리포트·알림의 "#c번호" 링크로 온 댓글 — 앱 안 이동(pushState)에서는 :target 이 바뀌지 않아 직접 강조한다
  const [target, setTarget] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const nickRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const [likes, setLikes] = useState<Record<string, number>>(() => Object.fromEntries(initial.map((c) => [String(c.id), c.likes ?? 0])));
  const [liked, setLiked] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setLiked(new Set(JSON.parse(window.localStorage.getItem(LIKES_KEY) ?? "[]") as string[]));
    } catch {}
  }, []);
  // 💬 수다방 (Sprint 84): 비번 입력 없이 이 브라우저의 4자리를 쓰고, 최근 100개부터 보여 준다
  const [show, setShow] = useState(100);
  const [savedNick, setSavedNick] = useState(false);
  // 📷 사진 1장 (Sprint 90): 고르면 바로 올리고, 보낼 때 id·token 만 넘긴다
  const [photo, setPhoto] = useState<{ id?: string; token?: string; preview: string; status: "uploading" | "done" | "error" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhoto({ preview, status: "uploading" });
    setError(null);
    try {
      const r = await upload(await shrinkIfNeeded(file));
      setPhoto({ preview, status: "done", id: r.id, token: r.token });
    } catch (err) {
      setPhoto(null);
      setError((err as Error).message);
    }
  };
  const photoReady = photo?.status === "done";
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 비밀번호는 이 브라우저가 알아서 (Sprint 96) — 채팅·댓글 모두
    setForm((f) => ({ ...f, pw: myPin() }));
  }, []);
  useEffect(() => {
    // 검색 결과(#c번호)로 왔으면 그 말을 보여 주고, 아니면 맨 아래 최신 대화로
    if (chat && !/^#c\d/.test(window.location.hash)) endRef.current?.scrollIntoView({ block: "end" });
  }, [chat, comments.length]);
  useEffect(() => {
    if (!chat || !target) return;
    const i = comments.findIndex((c) => c.id === target);
    if (i >= 0 && comments.length - i > show) {
      setShow(comments.length - i);
      requestAnimationFrame(() => document.getElementById(`c${target}`)?.scrollIntoView({ block: "center" }));
    }
  }, [chat, target, comments, show]);
  const retry = useRef(0);
  const sending = useRef<{ key: string; sent: string } | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = myNick();
      if (saved) {
        setForm((f) => ({ ...f, nickname: saved }));
        setSavedNick(true);
      }
      // 처음 온 사람은 임시 닉네임 없이 직접 정하게 한다 (사용자 10/22)
    } catch {}
  }, []);

  // 테스트 결과에서 "인증하기"로 왔으면 결과 한 줄을 채워 둔다 (Sprint 60·61). 각 인증 글에서만, 정해진 값만 받는다.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = String(postId);
    const line = id === EAR_BRAG_POST_ID ? earBragLine(q.get("ear")) : id === HEARING_BRAG_POST_ID ? hearingBragLine(q.get("hz")) : null;
    if (!line) return;
    setForm((f) => (f.body ? f : { ...f, body: line }));
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      // 닉네임이 비어 있으면 닉네임부터 (점수 줄은 채워져 있으니 장비만 적으면 된다)
      if (nickRef.current && !nickRef.current.value) return nickRef.current.focus();
      el.focus();
      el.setSelectionRange(line.length, line.length);
    });
  }, [postId]);

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
    if (!postId) return;

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
            const { id, body, hidden_reason, image_id } = ev.comment;
            setComments((list) => list.map((c) => (c.id === String(id) ? { ...c, body, hidden_reason, image_id: image_id ?? null } : c)));
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
    if (photo?.status === "uploading") {
      setBusy(false);
      return setError("사진을 올리는 중이에요. 잠깐만요.");
    }
    const image = photoReady ? { id: photo!.id!, token: photo!.token! } : undefined;
    const payload = { ...form, body: form.body.trim() || (image ? "📷" : form.body), ...(replyTo ? { parentId: replyTo.id } : {}), ...(image ? { image } : {}) };
    try {
      const pid = postId || (ensurePost ? await ensurePost() : "");
      if (!pid) throw new Error("잠시 후 다시 시도해 주세요.");
      if (pid !== postId) setPostId(pid);
      const { comment, notifyRef } = await api<{ comment: Comment; notifyRef?: string }>(`/api/posts/${pid}/comments`, "POST", payload, {
        idempotencyKey: requestKeyFor(sending, payload),
      });
      sending.current = undefined;
      setComments((list) => (list.some((x) => String(x.id) === String(comment.id)) ? list : [...list, norm(comment)]));
      setForm((f) => ({ ...f, body: "" }));
      setPhoto(null);
      setReplyTo(null);
      try {
        saveNick(form.nickname);
        setSavedNick(true);
      } catch {}
      // 댓글을 단 글은 자동으로 소식 받기 + 이 댓글에 답글·멘션이 오면 알림
      watchPost(pid);
      if (notifyRef) addMyComment(notifyRef);
      setPosted(true);
    } catch (err) {
      setError(isNetworkError(err) ? "연결이 끊겨 등록 결과를 받지 못했어요. 연결되면 다시 눌러주세요. (두 번 달리지 않아요)" : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const done = await withMyPin((pw) => api(`/api/comments/${id}`, "DELETE", { pw }), "댓글 비밀번호 4자리");
      if (done === null) return;
      setComments((list) => dropComment(list, id));
      if (replyTo?.id === id) setReplyTo(null);
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  // 👍 공감 (Sprint 78): 누른 댓글은 이 브라우저에만 기억
  const toggleLike = async (c: Comment) => {
    const on = !liked.has(c.id);
    setLiked((cur) => {
      const next = new Set(cur);
      if (on) next.add(c.id);
      else next.delete(c.id);
      try {
        window.localStorage.setItem(LIKES_KEY, JSON.stringify([...next].slice(-500)));
      } catch {}
      return next;
    });
    setLikes((cur) => ({ ...cur, [c.id]: Math.max(0, (cur[c.id] ?? 0) + (on ? 1 : -1)) }));
    try {
      const r = await api<{ likes: number }>(`/api/comments/${c.id}/like`, "POST", { on });
      setLikes((cur) => ({ ...cur, [c.id]: r.likes }));
    } catch {}
  };

  if (chat) {
    const shown = comments.slice(-show);
    return (
      <section id="comments" className="chat-room" aria-label="수다방">
        {comments.length > show && (
          <button type="button" className="btn btn-sm" onClick={() => setShow((n) => n + 100)}>
            이전 대화 더 보기
          </button>
        )}
        <ul className="chat-list">
          {shown.map((c) => (
            <li key={c.id} id={`c${c.id}`} className={`chat-msg${fresh.has(c.id) ? " new" : ""}${target === c.id ? " is-target" : ""}`}>
              <div className="chat-head">
                {c.is_ai_curated ? <><b>{c.nickname}</b><span className="ai-mark" title="AI가 작성한 댓글입니다." aria-label="AI 작성">🤖</span></> : <><b>{c.nickname}</b><NickBadge label={badgeOf(badges, c.nickname)} /></>}
                <time dateTime={c.created_at} suppressHydrationWarning>{timeAgo(c.created_at)}</time>
              </div>
              {c.hidden_reason ? (
                <div className="chat-bubble comment-hidden">🤖 AI 자동 운영이 <b>{abuseLabel(c.hidden_reason)}</b>이(가) 담긴 것으로 판단해 가렸어요.</div>
              ) : (
                <div className="chat-bubble">
                  <Photo id={c.image_id} />
                  {c.image_id && c.body === "📷" ? null : splitMentions(c.body, nicknames).map((p, i) => (p.mention ? <span key={i} className="mention">{p.text}</span> : p.text))}
                </div>
              )}
              {!c.hidden_reason && (
                <div className="chat-actions">
                  <button className={`linkish like${liked.has(c.id) ? " on" : ""}`} onClick={() => toggleLike(c)} aria-pressed={liked.has(c.id)} aria-label={`${c.nickname}님 말에 공감`}>
                    👍{likes[c.id] ? ` ${likes[c.id]}` : ""}
                  </button>
                  {c.liked_by?.length ? <span className="liked-by">👍 {c.liked_by.join("·")}</span> : null}
                  <button className="linkish" onClick={() => setForm((f) => ({ ...f, body: f.body.includes(`@${c.nickname}`) ? f.body : `@${c.nickname} ${f.body}` }))}>답하기</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div ref={endRef} />
        <form className="chat-form" onSubmit={submit}>
          <span className={`live-dot${live ? " on" : ""}`} title={live ? "실시간 연결됨" : "연결 중…"} />
          {!savedNick && (
            <label className="chat-nick">
              닉네임
              <input ref={nickRef} value={form.nickname} maxLength={20} required aria-label="닉네임" placeholder="처음 한 번만 정해요"
                onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            </label>
          )}
          {!savedNick && <NickCheck nickname={form.nickname} />}
          <PhotoPreview photo={photo} onClear={() => setPhoto(null)} />
          <div className="row chat-row">
            <PhotoButton fileRef={fileRef} onPick={pickPhoto} />
            <input className="input" placeholder="메시지" value={form.body} maxLength={1000} required={!photo} aria-label="메시지"
              onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <button className="btn btn-primary" disabled={busy || (!form.body.trim() && !photoReady)}>{busy ? "…" : "보내기"}</button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      </section>
    );
  }

  return (
    <section id="comments" aria-label="댓글">
      <h2 className="section-title">
        댓글 {comments.length}
        <span className={`live-dot${live ? " on" : ""}`} title={live ? "실시간 연결됨" : "연결 중…"} />
      </h2>
      {comments.length === 0 && <p className="hint">{casual ? "첫 댓글을 남겨 이야기를 시작해 보세요." : "첫 댓글로 팩트를 보태주세요."}</p>}
      {groups.map(({ root, replies }) => (
        <div key={root.id} className="comment-thread">
          {[root, ...replies].map((c) => {
            const to = c.parent_id && c.parent_id !== root.id ? byId.get(c.parent_id) : undefined;
            return (
              <div key={c.id} id={`c${c.id}`} className={`comment${c.id !== root.id ? " is-reply" : ""}${fresh.has(c.id) ? " new" : ""}${target === c.id ? " is-target" : ""}`}>
                <div className="comment-head">
                  {/* AI 표시는 이름 한 곳에 (이름 + 배지로 두 번 나오던 것) */}
                  {c.is_ai_curated ? <><b>{c.nickname}</b><span className="ai-mark" title="AI가 작성한 댓글입니다." aria-label="AI 작성">🤖</span></> : <><b>{c.nickname}</b><NickBadge label={badgeOf(badges, c.nickname)} /></>}
                  <time dateTime={c.created_at} suppressHydrationWarning>{timeAgo(c.created_at)}</time>
                  <span className="spacer" />
                  {!c.hidden_reason && (
                    <button className={`linkish like${liked.has(c.id) ? " on" : ""}`} onClick={() => toggleLike(c)} aria-pressed={liked.has(c.id)} aria-label={`${c.nickname}님 댓글에 공감`}>
                      👍{likes[c.id] ? ` ${likes[c.id]}` : ""}
                    </button>
                  )}
                  {c.liked_by?.length ? <span className="liked-by">👍 {c.liked_by.join("·")}</span> : null}
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
                    <Photo id={c.image_id} />
                    {c.image_id && c.body === "📷" ? null : splitMentions(c.body, nicknames).map((p, i) => (p.mention ? <span key={i} className="mention">{p.text}</span> : p.text))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <form id="write" className="form" onSubmit={submit} style={{ marginTop: 16 }}>
        {/* 닉네임은 처음 한 번만, 비밀번호는 자동 (Sprint 96) */}
        {!savedNick && (
          <>
            <input ref={nickRef} className="input" placeholder="닉네임 (처음 한 번만)" value={form.nickname} maxLength={20} required
              onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            <NickCheck nickname={form.nickname} />
          </>
        )}
        {replyTo && (
          <div className="reply-banner" role="status">
            ↳ <b>{replyTo.nickname}</b>님에게 답글
            <button type="button" className="linkish" onClick={() => setReplyTo(null)}>답글 취소</button>
          </div>
        )}
        <textarea ref={bodyRef} className="textarea short" maxLength={1000} required={!photo}
          aria-label={replyTo ? `${replyTo.nickname}님에게 답글` : "댓글"}
          placeholder={replyTo ? "답글" : "댓글"}
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
        {posted && !error && (
          <p className="hint" role="status">
            {/* 댓글을 단 사람에게 방 만들기 권유 (Sprint 49) */}
            💬 고마워요! 답글이 달리면 📬에서 알려 드려요. 이 주제로 더 이야기하고 싶다면 <Link href="/boards">🏠 내 덕질 방 만들기</Link>
          </p>
        )}
        <PhotoPreview photo={photo} onClear={() => setPhoto(null)} />
        <div className="row comment-submit-row">
          <PhotoButton fileRef={fileRef} onPick={pickPhoto} />
          <button className="btn btn-primary" disabled={busy}>{busy ? "등록 중…" : replyTo ? "답글 등록" : "댓글 등록"}</button>
        </div>
      </form>
    </section>
  );
}

/** 지워진 댓글을 빼고, 그 댓글에 단 답글은 서버처럼 원 댓글 없는 댓글로 */
function dropComment(list: Comment[], id: string): Comment[] {
  return list.filter((c) => c.id !== id).map((c) => (c.parent_id === id ? { ...c, parent_id: null } : c));
}

/** 댓글·수다방 사진 (Sprint 90) — 누르면 원본 */
function Photo({ id }: { id?: string | null }) {
  if (!id) return null;
  return (
    <a href={imageUrl(id)} target="_blank" rel="noopener" className="comment-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbUrl(id)} alt="첨부 사진" loading="lazy" />
    </a>
  );
}

function PhotoButton({ fileRef, onPick }: { fileRef: React.RefObject<HTMLInputElement | null>; onPick: (f: File | undefined) => void }) {
  return (
    <>
      <button type="button" className="btn photo-btn" onClick={() => fileRef.current?.click()} aria-label="사진 올리기">
        📷
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }} />
    </>
  );
}

function PhotoPreview({ photo, onClear }: { photo: { preview: string; status: string } | null; onClear: () => void }) {
  if (!photo) return null;
  return (
    <div className="photo-preview">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.preview} alt="올릴 사진" />
      <span className="hint">{photo.status === "uploading" ? "올리는 중…" : "📷 사진 1장"}</span>
      <button type="button" className="linkish" onClick={onClear} aria-label="사진 빼기">✕</button>
    </div>
  );
}
