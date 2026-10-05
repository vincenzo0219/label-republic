import Link from "next/link";

/**
 * 광고·공유 링크로 글에 바로 떨어진 첫 방문자용 한 줄 소개 (Sprint 48).
 * 홈의 환영 안내는 글 화면에 없어서, 코덱 질문 글에 "뭐고"라는 첫 댓글이 달렸다 — 여기가 어디인지부터 알려 준다.
 */
export function FirstVisitIntro({ roomSlug, roomName }: { roomSlug: string; roomName: string }) {
  return (
    <aside className="first-visit-intro" aria-label="노방장 소개">
      <p>
        👋 <b>노방장</b>은 방장 없는 덕후 커뮤니티예요. <b>가입 없이 닉네임만</b>으로 바로 답할 수 있어요.
      </p>
      <p className="first-visit-links">
        <a href="#comments">💬 댓글로 답하기</a>
        <Link href={`/c/${encodeURIComponent(roomSlug)}`}>{roomName} 방 구경하기 →</Link>
      </p>
    </aside>
  );
}
