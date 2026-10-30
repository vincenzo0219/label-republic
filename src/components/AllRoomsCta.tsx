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
  if (!show || count < 2) return null;
  return (
    <Link href="/?all=1#rooms" className="all-rooms-cta">
      🏠 노방장 방 {count}개 모두 보기 →
    </Link>
  );
}
