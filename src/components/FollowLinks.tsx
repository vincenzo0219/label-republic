/** 노방장 공식 SNS 팔로우 링크 — 사이트 방문자를 스레드·인스타 팔로워로 (Sprint 55) */
export const THREADS_URL = "https://www.threads.com/@nobangjang";
export const INSTAGRAM_URL = "https://www.instagram.com/nobangjang";

/** 글 맨 아래 한 줄 */
export function FollowCta() {
  return (
    <p className="follow-cta">
      🧵 새 토론은 스레드에 먼저 올라와요{" "}
      <a href={THREADS_URL} target="_blank" rel="noopener noreferrer">
        @nobangjang 팔로우
      </a>
    </p>
  );
}

/** 푸터 */
export function FollowLinks() {
  return (
    <>
      노방장 SNS{" "}
      <a href={THREADS_URL} target="_blank" rel="noopener noreferrer">
        🧵 스레드
      </a>{" "}
      ·{" "}
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
        📷 인스타그램
      </a>
    </>
  );
}
