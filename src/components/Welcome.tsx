"use client";

import Link from "next/link";
import { useState } from "react";
import { WELCOME_COOKIE } from "@/lib/onboarding";

/**
 * 첫 방문 안내 (Sprint 32). 서버가 쿠키를 보고 처음 온 사람에게만 그린다 — 화면이 그려진 뒤 끼어들지 않아 레이아웃이 흔들리지 않는다.
 * 닫으면 1년 동안 보이지 않는다 (쿠키에는 "닫음" 표시만, 추적에 쓰지 않음).
 */
export function Welcome({ boards, stats }: { boards: { slug: string; name: string }[]; stats: { posts: number; products: number } }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const close = () => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${WELCOME_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
    setOpen(false);
    // 닫기 버튼이 사라지므로 키보드·화면 낭독기 초점을 본문(보드 탭)으로 옮긴다
    requestAnimationFrame(() => {
      const next = document.getElementById("main");
      next?.focus();
    });
  };
  return (
    <section className="welcome" aria-labelledby="welcome-h">
      <div className="welcome-head">
        <h2 id="welcome-h">👋 라벨공화국은 처음이세요?</h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={close} aria-label="안내 닫기">
          닫기
        </button>
      </div>
      <ul className="welcome-points">
        <li>
          <b>🏷 라벨에 적힌 사실을 모아요</b> — 제품 라벨 사진·수치·출처로 이야기합니다. 광고 문구보다 라벨이 먼저예요.
        </li>
        <li>
          <b>🗳 방장이 없어요</b> — 추천·신고·정정 제안, 그리고 <Link href="/rules">이용자가 투표로 정한 규칙</Link>이 글을 정리합니다. 운영자가 한 일은{" "}
          <Link href="/transparency">모두 공개</Link>돼요.
        </li>
        <li>
          <b>🔑 가입 없이</b> — 닉네임과 비밀번호 4자리로 쓰고 고칩니다. 관심 보드·알림은 이 브라우저에만 저장돼요.
        </li>
      </ul>
      {stats.posts > 0 && (
        <p className="hint" style={{ margin: "0 0 8px" }}>
          지금까지 글 {stats.posts.toLocaleString("ko-KR")}개 · 제품 {stats.products.toLocaleString("ko-KR")}개가 모였어요.
        </p>
      )}
      <nav className="chips" aria-label="보드 둘러보기">
        {boards.map((b) => (
          <Link key={b.slug} className="chip" href={`/c/${encodeURIComponent(b.slug)}`}>
            {b.name}
          </Link>
        ))}
      </nav>
      <div className="welcome-actions">
        <Link className="btn btn-primary btn-sm" href="/write">
          ✍️ 첫 글 쓰기
        </Link>
        <Link className="btn btn-sm" href="/me">
          📬 관심 보드 고르기
        </Link>
        <Link className="btn btn-sm" href="/policy">
          운영 원칙
        </Link>
      </div>
    </section>
  );
}
