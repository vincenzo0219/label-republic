import Link from "next/link";
import { getBoardThreshold } from "@/lib/repo/board-requests";
import { listPosts } from "@/lib/repo/posts";

/**
 * 홈 맨 위 "💬 지금 이야기해요" (Sprint 47). 광고로 처음 온 사람 85명 중 글을 연 사람이 2명뿐이었다 —
 * 첫 화면이 안내 글로 꽉 차 글이 하나도 안 보였다. 답하기 쉬운 잡담 질문 몇 개를 신뢰도순 피드보다 먼저 보여 준다.
 */
export async function ChatStarters() {
  const [{ items }, threshold] = await Promise.all([
    listPosts({ sort: "latest", type: "chat", page: 1, pageSize: 3 }).catch(() => ({ items: [] })),
    getBoardThreshold().catch(() => null),
  ]);
  if (items.length === 0) return null;
  return (
    <section className="chat-starters" aria-labelledby="chat-starters-h">
      <h2 id="chat-starters-h">💬 지금 이야기해요 <span>가입 없이 바로 댓글 달 수 있어요</span></h2>
      <ul>
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/posts/${p.id}#comments`}>
              <span className="chat-starter-title">{p.title}</span>
              <span className="chat-starter-meta">
                {p.category.name} · {p.comment_count > 0 ? `댓글 ${p.comment_count}` : "첫 댓글을 기다려요"} <b aria-hidden>답하기 →</b>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {/* 방 만들기 유도 (Sprint 49) */}
      <p className="chat-starters-room">
        원하는 주제가 없나요? <Link href="/boards">🏠 내 덕질 방 만들기</Link>
        {threshold && threshold.needed <= 1 ? " — 지금은 요청하면 바로 열려요" : ""}
      </p>
    </section>
  );
}
