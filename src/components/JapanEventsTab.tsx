import Link from "next/link";
import { getPost, listPosts } from "@/lib/repo/posts";
import { SeenTracker } from "./SeenTracker";

/** 🗾 일본 행사 탭 (11/4 대표님 "일본 행사는 탭을 옆에 따로 만들자"): 애니·만화 덕후방의 "[일본]" 말머리 글. 최신 글은 본문 전체, 지난 판은 제목 링크 */
export const JAPAN_TAB = "japan";
export const JAPAN_HEAD = "일본";

export async function JapanEventsTab({ categoryId }: { categoryId: number }) {
  const { items } = await listPosts({ categoryId, head: JAPAN_HEAD, sort: "latest", pageSize: 6, hotFirst: false }).catch(() => ({ items: [] as Awaited<ReturnType<typeof listPosts>>["items"] }));
  const latest = items[0] ? await getPost(items[0].id).catch(() => null) : null;
  if (!latest) return <p className="hint japan-empty">일본 애니 행사 정리 글은 매달 25일에 올라와요.</p>;
  return (
    <div className="japan-tab">
      <article className="card japan-latest">
        <h2 data-post-id={latest.id}>
          <Link href={`/posts/${latest.id}`}>{latest.title.replace(/^\[일본\]\s*/, "")}</Link>
        </h2>
        {/* 👁 본 사람 (11/5 대표님 "몇명이 봤는지가 없네"): 이 탭에서 읽은 것도 글 조회수로 센다 (SeenTracker) */}
        <p className="hint japan-meta">👁 조회 {latest.view_count.toLocaleString("ko-KR")}</p>
        <div className="japan-body">{latest.body}</div>
        <p className="hint">
          <Link href={`/posts/${latest.id}`}>댓글 남기기 →</Link>
        </p>
      </article>
      <SeenTracker />
      {items.length > 1 && (
        <ul className="japan-past">
          {items.slice(1).map((p) => (
            <li key={p.id}>
              <Link href={`/posts/${p.id}`}>{p.title.replace(/^\[일본\]\s*/, "")}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
