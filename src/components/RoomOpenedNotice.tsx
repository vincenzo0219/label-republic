"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasUntoldRoomRequests, markRoomRequestTold, myRoomRequests } from "@/lib/room-requests";
import type { BoardRequest } from "@/lib/types";

type Opened = { id: string; name: string; slug: string };

/**
 * 내가 요청·동의한 방이 열렸으면 홈에서 한 번 알려 준다 (론칭 검수). 요청은 하루 뒤에 열리는데,
 * 그때 알려 주지 않으면 만든 사람조차 방이 열린 걸 모르고 첫 글을 놓친다.
 * 아직 알려 주지 않은 요청이 이 브라우저에 있을 때만 서버에 묻는다.
 */
export function RoomOpenedNotice() {
  const [opened, setOpened] = useState<Opened[]>([]);

  useEffect(() => {
    if (!hasUntoldRoomRequests()) return;
    const mine = myRoomRequests();
    let alive = true;
    fetch("/api/board-requests")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { requests: BoardRequest[] } | null) => {
        if (!alive || !data) return;
        const found: Opened[] = [];
        const closed: string[] = [];
        for (const r of data.requests) {
          const m = mine[r.id];
          if (!m || m.told) continue;
          if (r.status === "promoted" && r.promoted_category_slug) found.push({ id: r.id, name: r.requested_name, slug: r.promoted_category_slug });
          else if (r.status !== "open") closed.push(r.id); // 중복·병합으로 닫힌 것은 조용히 정리
        }
        if (closed.length) markRoomRequestTold(closed);
        setOpened(found);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (opened.length === 0) return null;
  const dismiss = () => {
    markRoomRequestTold(opened.map((o) => o.id));
    setOpened([]);
  };
  return (
    <div className="notice room-opened" role="status">
      {opened.map((o) => (
        <p key={o.id}>
          🎉 함께 원했던 <b>{o.name}</b> 방이 열렸어요!{" "}
          <Link href={`/c/${encodeURIComponent(o.slug)}`} onClick={dismiss}>
            방 구경하기
          </Link>{" "}
          ·{" "}
          <Link href={`/write?category=${encodeURIComponent(o.slug)}`} onClick={dismiss}>
            ✍️ 첫 글 쓰기
          </Link>
        </p>
      ))}
      <button type="button" className="linkish" onClick={dismiss}>
        닫기
      </button>
    </div>
  );
}
