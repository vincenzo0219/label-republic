import Link from "next/link";
import { getBoardThreshold } from "@/lib/repo/board-requests";
import { activeRoomsFirst, quietRoomSlugs } from "@/lib/repo/categories";
import { listPosts } from "@/lib/repo/posts";

/**
 * 홈 맨 위 "💬 지금 이야기해요" (Sprint 47). 광고로 처음 온 사람 85명 중 글을 연 사람이 2명뿐이었다 —
 * 첫 화면이 안내 글로 꽉 차 글이 하나도 안 보였다. 답하기 쉬운 잡담 질문 몇 개를 신뢰도순 피드보다 먼저 보여 준다.
 * 사람이 모인 방의 질문을 먼저 (론칭 후: 빈 방 질문은 답이 안 달려 첫인상이 썰렁했다).
 */
export async function ChatStarters() {
  const [{ items: recent }, threshold, quiet] = await Promise.all([
    listPosts({ sort: "latest", type: "chat", page: 1, pageSize: 12 }).catch(() => ({ items: [] })),
    getBoardThreshold().catch(() => null),
    quietRoomSlugs().catch(() => new Set<string>()),
  ]);
  const items = activeRoomsFirst(recent.map((p) => ({ ...p, slug: p.category.slug })), quiet).slice(0, 3);
  if (items.length === 0) return null;
  // 질문이 모두 한 방이면 방 이름을 반복하지 않는다 (론칭 2주차: "첫 댓글을 기다려요"가 줄마다 반복돼 썰렁해 보였다)
  const oneRoom = new Set(items.map((p) => p.category.slug)).size === 1;
  return (
    <section className="chat-starters" aria-labelledby="chat-starters-h">
      <h2 id="chat-starters-h">💬 지금 이야기해요</h2>
      <ul>
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/posts/${p.id}#comments`}>
              <span className="chat-starter-title">{p.title}</span>
              <span className="chat-starter-meta">
                {[oneRoom ? "" : p.category.name, p.comment_count > 0 ? `댓글 ${p.comment_count}` : ""].filter(Boolean).join(" · ")}
                <b aria-hidden>답하기 →</b>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {/* 방 만들기 유도 (Sprint 49) */}
      <p className="chat-starters-room">
        원하는 주제가 없나요? <Link href="/boards">🏠 방 만들기</Link>
        {threshold && threshold.needed <= 1 ? " · 요청하면 바로 열려요" : ""}
      </p>
    </section>
  );
}
