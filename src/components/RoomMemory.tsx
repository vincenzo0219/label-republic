"use client";

import { useEffect } from "react";

const COOKIE = "lr_room";

/** 마지막에 있던 방을 기억 — 다음에 노방장을 열면 그 방이 첫 화면 (Sprint 96) */
export function RoomMemory({ slug }: { slug: string }) {
  useEffect(() => {
    document.cookie = `${COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
  }, [slug]);
  return null;
}

/** "전체 방 보기"로 홈에 오면 기억을 지운다 — 다시 방에 들어가면 또 기억 */
export function ForgetRoom() {
  useEffect(() => {
    document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  }, []);
  return null;
}
