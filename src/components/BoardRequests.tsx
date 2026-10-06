"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { markRoomRequestTold, myRoomRequests, rememberRoomRequest } from "@/lib/room-requests";
import type { BoardRequest } from "@/lib/types";

/** "10월 2일(금) 오후 10:15" — toLocaleString 은 서버(Node)와 브라우저의 출력이 미묘하게 달라 화면이 어긋나므로 직접 만든다 */
export function kstTime(ms: number) {
  const d = new Date(ms + 9 * 3600_000);
  const h = d.getUTCHours();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const wd = "일월화수목금토"[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${wd}) ${ampm} ${h12}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 방 만들기 요청 목록. 혼자서는 방을 열 수 없으니(동의 N명), 요청한 사람이 친구를 데려올 수 있게
 * 요청마다 공유 링크(/boards#req-ID)를 주고, 동의가 다 모이면 언제 열리는지 보여 준다 (론칭 검수).
 */
export function BoardRequests({ initial, threshold, minAgeHours }: { initial: BoardRequest[]; threshold: number; minAgeHours: number }) {
  const [requests, setRequests] = useState(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ name: string; slug: string } | null>(null);
  const [shareMsg, setShareMsg] = useState<{ id: string; text: string } | null>(null);

  // 이 브라우저에서 요청·동의한 것은 다시 와도 "동의함"으로 (서버 기록은 IP·브라우저 지문이라 화면에 못 돌려준다)
  useEffect(() => {
    setVoted(new Set(Object.keys(myRoomRequests())));
  }, []);

  async function share(r: BoardRequest) {
    const left = Math.max(0, threshold - r.vote_count);
    const url = `${window.location.origin}/boards#req-${r.id}`;
    const text = `노방장에 "${r.requested_name}" 방을 만들고 있어요.${left > 0 ? ` ${left}명만 더 동의하면 열려요!` : ""} 링크에서 👍 나도 원해요 를 눌러 주세요 (가입 없음)`;
    setShareMsg(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${r.requested_name} 방 만들기`, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShareMsg({ id: r.id, text: "링크를 복사했어요. 카톡·DM에 붙여넣어 보내 주세요." });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setShareMsg({ id: r.id, text: `이 주소를 보내 주세요: ${url}` });
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { request, promoted } = await api<{ request: BoardRequest; promoted?: boolean }>("/api/board-requests", "POST", { name, description });
      // 혼자서 바로 열린 방 (Sprint 49) — 열렸다는 알림은 홈 대신 여기서 바로
      if (promoted && request.promoted_category_slug) setOpened({ name: request.requested_name, slug: request.promoted_category_slug });
      setRequests((r) => [request, ...r]);
      setVoted((v) => new Set(v).add(request.id)); // 요청한 사람은 첫 동의로 센다 (Sprint 39)
      rememberRoomRequest(request.id, request.requested_name);
      if (promoted) markRoomRequestTold([request.id]); // 여기서 이미 알렸으니 홈에서 또 알리지 않는다
      setJustCreated(request.id);
      setName("");
      setDescription("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function vote(id: string) {
    try {
      const res = await api<{ request: BoardRequest; alreadyVoted: boolean; promoted: boolean; promotableAt: string | null }>(`/api/board-requests/${id}/vote`, "POST");
      setRequests((list) => list.map((r) => (r.id === id ? res.request : r)));
      setVoted((s) => new Set(s).add(id));
      rememberRoomRequest(id, res.request.requested_name);
      if (res.alreadyVoted) window.alert("이미 동의했어요.");
      if (res.promoted) window.alert(`🎉 "${res.request.requested_name}" 방이 열렸어요!`);
      // 동의가 다 모였지만 대기 시간이 남은 경우는 카드 아래에 열리는 시각을 보여 준다
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  return (
    <>
      {opened && (
        <div className="notice room-opened" role="status">
          <p>
            🎉 <b>{opened.name}</b> 방이 열렸어요! 🤖 AI 큐레이터가 곧 첫 질문 글을 올려요.{" "}
            <Link href={`/c/${encodeURIComponent(opened.slug)}`}>방 가기</Link> ·{" "}
            <Link href={`/write?category=${encodeURIComponent(opened.slug)}`}>✍️ 첫 글 쓰기</Link>
          </p>
        </div>
      )}
      <form className="form card" onSubmit={create}>
        <input className="input" placeholder="방 이름 (예: 커피 원두 로스팅)" value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="한 줄 설명 (선택)" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary">방 만들기 요청</button>
      </form>

      {requests.length === 0 && <div className="empty">아직 요청이 없어요. 첫 방을 제안해 보세요!</div>}
      {requests.map((r) => (
        <div key={r.id} id={`req-${r.id}`} className="card room-request">
          <div className="card-top">
            {r.status === "promoted" ? (
              <span className="badge badge-top5">개설됨</span>
            ) : r.status === "duplicate" && r.merged_into ? (
              <span className="badge badge-cat">같은 주제의 요청에 병합됨</span>
            ) : r.status === "duplicate" ? (
              <span className="badge badge-cat">기존 방과 중복</span>

            ) : r.vote_count >= threshold ? (
              <span className="badge badge-pending">⏳ 개설 대기</span>
            ) : (
              <span className="badge badge-pending">동의 모으는 중</span>
            )}
          </div>
          <h2 className="card-title">
            {r.status !== "open" && r.promoted_category_slug ? (
              <Link href={`/c/${encodeURIComponent(r.promoted_category_slug)}`}>{r.requested_name} →</Link>
            ) : (
              r.requested_name
            )}
          </h2>
          {r.description && <p className="excerpt">{r.description}</p>}
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={threshold} aria-valuenow={Math.min(r.vote_count, threshold)} aria-label={`개설 동의 ${r.vote_count} / ${threshold}명`}>
            <i style={{ width: `${Math.min(100, (r.vote_count / threshold) * 100)}%` }} />
          </div>
          <div className="card-meta">
            <span>{r.vote_count} / {threshold}명</span>
            <span className="spacer" />
            {r.status === "open" && (
              <>
                <button type="button" className="btn btn-sm" onClick={() => share(r)}>
                  🔗 {r.vote_count < threshold ? "친구에게 동의 부탁" : "공유"}
                </button>
                <button className="btn btn-sm" onClick={() => vote(r.id)} disabled={voted.has(r.id)}>
                  {voted.has(r.id) ? "동의함" : "👍 나도 원해요"}
                </button>
              </>
            )}
          </div>
          {r.status === "open" && r.vote_count >= threshold && (
            <p className="hint" role="status">
              ⏳ 동의가 다 모였어요. {kstTime(new Date(r.created_at).getTime() + minAgeHours * 3600_000)} 이후 자동으로 열려요.
            </p>
          )}
          {justCreated === r.id && r.vote_count < threshold && (
            <p className="notice" role="status">
              요청했어요! 내 동의가 첫 번째예요. <b>{threshold - r.vote_count}명</b>만 더 동의하면 하루 뒤 열려요 — 위의 🔗 버튼으로 함께할 친구에게 링크를 보내 보세요.
              방이 열리면 홈에서 알려 드릴게요.
            </p>
          )}
          {shareMsg?.id === r.id && (
            <p className="hint" role="status">
              {shareMsg.text}
            </p>
          )}
        </div>
      ))}
    </>
  );
}
