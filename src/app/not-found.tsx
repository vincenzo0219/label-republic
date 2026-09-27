import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <p>페이지를 찾을 수 없습니다. 삭제되었거나 주소가 잘못되었어요.</p>
      <Link className="btn" href="/">홈으로</Link>
    </div>
  );
}
