/** 노방장 공식 SNS 팔로우 링크 — 사이트 방문자를 스레드·인스타 팔로워로 (Sprint 55) */
export const THREADS_URL = "https://www.threads.com/@nobangjang";
export const INSTAGRAM_URL = "https://www.instagram.com/nobangjang";
export const KAKAO_URL = "https://pf.kakao.com/_xmxjFmX";
/** 누르면 바로 채널 추가 화면 */
export const KAKAO_ADD_URL = `${KAKAO_URL}/friend`;

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
      <a href={THREADS_URL} target="_blank" rel="noopener noreferrer">
        🧵 스레드
      </a>{" "}
      ·{" "}
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
        📷 인스타그램
      </a>{" "}
      ·{" "}
      <a href={KAKAO_URL} target="_blank" rel="noopener noreferrer">
        💬 카톡 채널
      </a>
    </>
  );
}
