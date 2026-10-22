"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { myNick } from "@/lib/me";

/** 처음 닉네임을 적을 때 이미 누가 쓰는 닉네임이면 바로 알린다 (10/22). 내 닉네임(이 브라우저)이면 묻지 않는다 */
export function NickCheck({ nickname }: { nickname: string }) {
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    const n = nickname.trim();
    setTaken(false);
    if (n.length < 2 || n === myNick()) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", nickname: n }), signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { status?: string } | null) => setTaken(d?.status === "taken"))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [nickname]);
  if (!taken) return null;
  return (
    <p className="error" role="alert">
      이미 쓰는 닉네임이에요. 다른 닉네임을 정해 주세요. <Link href="/my">내 닉네임이면 불러오기</Link>
    </p>
  );
}
