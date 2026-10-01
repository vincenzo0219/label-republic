"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client-api";
import type { BoardRequest } from "@/lib/types";

export function BoardRequests({ initial, threshold }: { initial: BoardRequest[]; threshold: number }) {
  const [requests, setRequests] = useState(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState<Set<string>>(new Set());

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { request } = await api<{ request: BoardRequest }>("/api/board-requests", "POST", { name, description });
      setRequests((r) => [request, ...r]);
      setVoted((v) => new Set(v).add(request.id)); // 요청한 사람은 첫 동의로 센다 (Sprint 39)
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
      if (res.alreadyVoted) window.alert("이미 동의했어요.");
      if (res.promoted) window.alert(`🎉 "${res.request.requested_name}" 방이 열렸어요!`);
      if (res.promotableAt) {
        const at = new Date(res.promotableAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
        window.alert(`동의가 다 모였어요! 급하게 몰아서 방을 여는 것을 막기 위해 ${at} 이후 자동으로 열립니다.`);
      }
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  return (
    <>
      <form className="form card" onSubmit={create}>
        <input className="input" placeholder="방 이름 (예: 커피 원두 로스팅)" value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="한 줄 설명 (선택)" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary">방 만들기 요청</button>
      </form>

      {requests.length === 0 && <div className="empty">아직 요청이 없어요. 첫 방을 제안해 보세요!</div>}
      {requests.map((r) => (
        <div key={r.id} className="card">
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
              <button className="btn btn-sm" onClick={() => vote(r.id)} disabled={voted.has(r.id)}>
                {voted.has(r.id) ? "동의함" : "👍 나도 원해요"}
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
