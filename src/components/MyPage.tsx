"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { myNick, myPin, myPostIds, saveNick, setMyPin } from "@/lib/me";
import { getMyComments, getWatchedPosts, refId } from "@/lib/watchlist";
import { timeAgo } from "@/lib/format";
import { NickCheck } from "./NickCheck";

type MyPost = { id: string; title: string; nickname: string; created_at: string; comment_count: number; room: string; fp: boolean };
type MyComment = { id: string; post_id: string; post_title: string; body: string; nickname: string; created_at: string; fp: boolean };

/**
 * 마이페이지 (10/22) — 가입 없이 이 브라우저 기준. 닉네임·비밀번호 바꾸기, 내가 쓴 글·댓글.
 * 다른 기기·브라우저에서 쓴 글은 여기 안 보인다(서버는 사람을 저장하지 않는다).
 */
export function MyPage() {
  const [nick, setNick] = useState("");
  const [newNick, setNewNick] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [posts, setPosts] = useState<MyPost[] | null>(null);
  const [comments, setComments] = useState<MyComment[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const [loginNick, setLoginNick] = useState("");
  const [loginPin, setLoginPin] = useState("");

  const load = useCallback(async () => {
    const mine = new Set(myPostIds());
    const me = myNick();
    const postIds = [...new Set([...mine, ...getWatchedPosts()])].slice(-100);
    const commentIds = getMyComments().map(refId).slice(-100);
    try {
      const r = await api<{ posts: MyPost[]; comments: MyComment[] }>("/api/me", "POST", { action: "activity", posts: postIds, comments: commentIds });
      // 지켜보는 글 중에는 남의 글도 있으니, 내가 기억한 글·같은 접속·같은 닉네임만 "내 글"로
      setPosts(r.posts.filter((p) => mine.has(p.id) || p.fp || (me && p.nickname === me)));
      setComments(r.comments);
    } catch {
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    const n = myNick();
    setNick(n);
    setNewNick(n);
    setPin(myPin());
    void load();
  }, [load]);

  const ids = () => ({ posts: (posts ?? []).map((p) => p.id), comments: comments.map((c) => c.id) });

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const n = newNick.trim();
    if (!n || n === nick) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ posts: number; comments: number }>("/api/me", "POST", { action: "rename", pw: pin, nickname: n, from: nick, ...ids() });
      saveNick(n);
      setNick(n);
      setMsg({ ok: true, text: `닉네임을 바꿨어요. 지난 글 ${r.posts}개·댓글 ${r.comments}개도 함께 바뀌었어요.` });
      void load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function changePin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin) || newPin === pin) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ posts: number; comments: number }>("/api/me", "POST", { action: "pin", pw: pin, newPw: newPin, nickname: nick, ...ids() });
      setMyPin(newPin);
      setPin(newPin);
      setNewPin("");
      setMsg({ ok: true, text: `비밀번호를 바꿨어요. 글 ${r.posts}개·댓글 ${r.comments}개에 새 번호가 적용됐어요.` });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const n = loginNick.trim();
    if (n.length < 2 || !/^\d{4}$/.test(loginPin)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/me", "POST", { action: "login", nickname: n, pw: loginPin });
      saveNick(n);
      setMyPin(loginPin);
      setNick(n);
      setNewNick(n);
      setPin(loginPin);
      setLoginNick("");
      setLoginPin("");
      setMsg({ ok: true, text: `${n}님으로 불러왔어요. 이제 이 기기에서도 같은 닉네임으로 써요.` });
      void load();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="my-page">
      <section className="card">
        <h2 className="card-title">닉네임</h2>
        <form className="row" onSubmit={rename}>
          <input className="input" value={newNick} maxLength={20} placeholder="닉네임 정하기" aria-label="닉네임" onChange={(e) => setNewNick(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !newNick.trim() || newNick.trim() === nick}>{nick ? "바꾸기" : "정하기"}</button>
        </form>
        <NickCheck nickname={newNick} />
        <p className="hint">닉네임은 한 사람만 쓸 수 있어요. 바꾸면 이 브라우저에서 쓴 지난 글·댓글 닉네임도 같이 바뀌어요.</p>
      </section>

      <section className="card">
        <h2 className="card-title">다른 기기에서 쓰던 닉네임 불러오기</h2>
        <form onSubmit={login} style={{ display: "grid", gap: 8 }}>
          <input className="input" value={loginNick} maxLength={20} placeholder="내 닉네임" aria-label="불러올 닉네임" onChange={(e) => setLoginNick(e.target.value)} />
          <div className="row">
            <input className="input" value={loginPin} inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="비밀번호 4자리" aria-label="비밀번호"
              onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ""))} />
            <button className="btn" disabled={busy || loginNick.trim().length < 2 || loginPin.length !== 4}>불러오기</button>
          </div>
        </form>
        <p className="hint">예전 기기의 마이페이지에서 비밀번호를 확인하거나 외우기 쉬운 번호로 바꿔 두세요.</p>
      </section>

      <section className="card">
        <h2 className="card-title">비밀번호</h2>
        <p>
          지금 번호 <b>{showPin ? pin : "••••"}</b>{" "}
          <button type="button" className="linkish" onClick={() => setShowPin((v) => !v)}>{showPin ? "숨기기" : "보기"}</button>
        </p>
        <form className="row" onSubmit={changePin}>
          <input className="input" value={newPin} inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="새 번호 4자리" aria-label="새 비밀번호"
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
          <button className="btn" disabled={busy || newPin.length !== 4 || newPin === pin}>바꾸기</button>
        </form>
        <p className="hint">글·댓글을 고치거나 지울 때 쓰는 번호예요. 다른 기기에서 고치려면 이 번호를 기억해 두세요.</p>
      </section>

      {msg && <p className={msg.ok ? "notice" : "error"} role="status">{msg.text}</p>}

      <section>
        <div className="row" role="tablist" style={{ gap: 8, margin: "14px 0 8px" }}>
          <button role="tab" aria-selected={tab === "posts"} className={`btn btn-sm${tab === "posts" ? " btn-primary" : ""}`} onClick={() => setTab("posts")}>
            ✍️ 내 글 {posts?.length ?? ""}
          </button>
          <button role="tab" aria-selected={tab === "comments"} className={`btn btn-sm${tab === "comments" ? " btn-primary" : ""}`} onClick={() => setTab("comments")}>
            💬 내 댓글 {comments.length}
          </button>
        </div>
        {posts === null ? (
          <p className="hint">불러오는 중…</p>
        ) : tab === "posts" ? (
          posts.length ? (
            <ul className="my-list">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link href={`/posts/${p.id}`}>{p.title}</Link>
                  <span className="hint"> · {p.room} · 💬 {p.comment_count} · {timeAgo(p.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">아직 쓴 글이 없어요. <Link href="/write">첫 글 쓰기</Link></p>
          )
        ) : comments.length ? (
          <ul className="my-list">
            {comments.map((c) => (
              <li key={c.id}>
                <Link href={`/posts/${c.post_id}#c${c.id}`}>{c.body}</Link>
                <span className="hint"> · {c.post_title} · {timeAgo(c.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">아직 단 댓글이 없어요.</p>
        )}
        <p className="hint">가입 없이 이 브라우저에 기록돼요. 다른 기기·브라우저에서 쓴 글은 여기 안 보여요.</p>
      </section>

      <p>
        <Link href="/me">📬 관심 방·새 소식</Link>
      </p>
    </div>
  );
}
