import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>페이지를 찾을 수 없습니다</h1>
      <p>삭제되었거나 주소가 잘못되었어요.</p>
      <form action="/search" method="get" role="search" aria-label="다른 글 검색" className="row" style={{ gridTemplateColumns: "1fr auto", maxWidth: 420, margin: "16px auto" }}>
        <input className="input" type="search" name="q" placeholder="찾으시는 성분·제품을 검색해 보세요" aria-label="검색어" />
        <button className="btn btn-primary" style={{ height: "auto" }}>
          검색
        </button>
      </form>
      <Link className="btn" href="/">
        홈으로
      </Link>
    </div>
  );
}
