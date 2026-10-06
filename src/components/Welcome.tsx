"use client";

import Link from "next/link";
import { useState } from "react";
import { WELCOME_COOKIE } from "@/lib/onboarding";

/**
 * 첫 방문 안내 (Sprint 32). 서버가 쿠키를 보고 처음 온 사람에게만 그린다 — 화면이 그려진 뒤 끼어들지 않아 레이아웃이 흔들리지 않는다.
 * 닫으면 1년 동안 보이지 않는다 (쿠키에는 "닫음" 표시만, 추적에 쓰지 않음).
 */
export function Welcome({
  boards,
  stats,
  roomVotes,
}: {
  boards: { slug: string; name: string }[];
  stats: { posts: number; products: number };
  /** 지금 새 방을 여는 데 필요한 동의 수 (Sprint 39) */
  roomVotes: number;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const close = () => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${WELCOME_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
    setOpen(false);
    // 닫기 버튼이 사라지므로 키보드·화면 낭독기 초점을 본문(방 탭)으로 옮긴다
    requestAnimationFrame(() => {
      const next = document.getElementById("main");
      next?.focus();
    });
  };
  // 짧게: 한 줄 소개 + 펼치면 자세히 (Sprint 47). 첫 화면에서 글이 바로 보여야 한다 — 긴 안내는 광고로 온 사람을 돌려보냈다
  return (
    <section className="welcome welcome-compact" aria-labelledby="welcome-h">
      <div className="welcome-head">
        <h2 id="welcome-h">👋 방장 없는 덕후 커뮤니티예요</h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={close} aria-label="안내 닫기">
          닫기
        </button>
      </div>
      <p className="welcome-line">가입 없이 닉네임만으로 바로 써요. 아래 질문에 한 줄만 답해 보세요 👇</p>
      <details className="welcome-more">
        <summary>노방장은 어떻게 돌아가요?</summary>
        <ul className="welcome-points">
          <li>
            <b>🏠 방장 없는 방</b> — 누구도 방을 독차지하지 않고, 추천·신고와 <Link href="/rules">이용자가 투표로 정한 규칙</Link>이 글을
            정리합니다. 운영자가 한 일은 <Link href="/transparency">모두 공개</Link>돼요.
          </li>
          <li>
            <b>✨ 방은 누구나 만들어요</b> — 원하는 방이 없으면 <Link href="/boards">방 만들기</Link>를 요청하세요. {roomVotes <= 1 ? (
              <>지금은 요청하면 <b>바로</b> 열려요.</>
            ) : (
              <>
                지금은 <b>{roomVotes}명</b>만 동의하면 하루 뒤 자동으로 열려요.
              </>
            )}
          </li>
          <li>
            <b>🔑 가입 없이</b> — 닉네임과 비밀번호 4자리로 쓰고 고칩니다. 관심 방·알림은 이 브라우저에만 저장돼요.
          </li>
        </ul>
        {stats.posts > 0 && (
          <p className="hint" style={{ margin: "0 0 8px" }}>
            {/* 0인 숫자는 보여 주지 않는다 — 비어 보이는 말은 사람을 돌려보낸다 (Sprint 46) */}
            지금까지 글 {stats.posts.toLocaleString("ko-KR")}개{stats.products > 0 ? ` · 제품 ${stats.products.toLocaleString("ko-KR")}개` : ""}가 모였어요.
          </p>
        )}
        <p className="welcome-sub">지금 열린 방</p>
        <nav className="chips" aria-label="방 둘러보기">
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
          <Link className="btn btn-sm" href="/boards">
            🏠 방 만들기
          </Link>
          <Link className="btn btn-sm" href="/me">
            📬 관심 방 고르기
          </Link>
          <Link className="btn btn-sm" href="/policy">
            운영 원칙
          </Link>
        </div>
      </details>
    </section>
  );
}
