/**
 * 광고·공유 링크로 글에 바로 떨어진 첫 방문자용 한 줄 소개 (Sprint 48).
 * 홈의 환영 안내는 글 화면에 없어서, 코덱 질문 글에 "뭐고"라는 첫 댓글이 달렸다 — 여기가 어디인지부터 알려 준다.
 * 길면 읽지 않는다는 운영자 피드백으로 한 줄만 (방 이름 배지가 바로 아래에서 방으로 이어 준다).
 */
export function FirstVisitIntro() {
  return (
    <aside className="first-visit-intro" aria-label="노방장 소개">
      <p>
        👋 <b>노방장</b> · 가입 없이 닉네임만으로 답할 수 있어요 <a href="#comments">💬 답하기</a>
      </p>
    </aside>
  );
}
