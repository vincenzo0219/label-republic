import Link from "next/link";

/**
 * 🏠 방 화면 맨 위 "다른 방" 줄 (10/30 대표님 "다른 방 보기가 내 방 안에 있는 느낌이라 헷갈리는 거 같애. 맨 위쯤으로").
 * 밴드·카페처럼 방 화면 꼭대기에서 노방장 홈(모든 방)으로 돌아가는 길. 방 안 제목 줄의 칩·큰 버튼 대신 이것 하나만.
 */
export function RoomTopBar({ count }: { count: number }) {
  return (
    <Link href="/?all=1#rooms" className="room-topbar">
      <span aria-hidden>‹</span> 노방장 홈 <span className="room-topbar-more">다른 방 {Math.max(0, count - 1)}개 둘러보기 →</span>
    </Link>
  );
}
