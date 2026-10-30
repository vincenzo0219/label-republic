"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMyRooms } from "@/lib/myRooms";

const FROM_SNS_KEY = "nb:fromSns";

/**
 * 🏠 SNS·광고로 방에 처음 들어온 사람에게 "다른 방도 많다"를 크게 (10/30 대표님 "인스타 광고를 보고 들어온 사람이 쉽게 전체방으로").
 * 주소에 from=·utm_ 가 있었거나 아직 내 방이 없으면 보인다. SNS로 왔다는 표시는 이 탭을 닫을 때까지 기억한다
 */
export function AllRoomsCta({ count }: { count: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let fromSns = false;
    try {
      const q = new URLSearchParams(location.search);
      if (q.has("from") || [...q.keys()].some((k) => k.startsWith("utm_"))) sessionStorage.setItem(FROM_SNS_KEY, "1");
      fromSns = sessionStorage.getItem(FROM_SNS_KEY) === "1";
    } catch {}
    setShow(fromSns || getMyRooms().length === 0);
  }, []);
  // 큰 버튼이 보이면 제목 옆 작은 "☰ 다른 방 n개"는 숨긴다 (10/30 대표님 "다른방 7개는 뭐고? 방 8개 모두보기는 뭐야?": 둘이 같이 보여 헷갈림)
  useEffect(() => {
    if (!show || count < 2) return;
    document.body.classList.add("rooms-cta-on");
    return () => document.body.classList.remove("rooms-cta-on");
  }, [show, count]);
  if (!show || count < 2) return null;
  return (
    <Link href="/?all=1#rooms" className="all-rooms-cta">
      🏠 다른 방도 둘러보기 · {count - 1}개 →
    </Link>
  );
}
