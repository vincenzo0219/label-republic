import { NickBadge } from "./NickBadge";
import Link from "next/link";
import { snippet } from "@/lib/highlight";
import { smallThumbUrl } from "@/lib/media-url";
import { timeAgo } from "@/lib/format";
import type { PostCard as PostCardData } from "@/lib/types";
import { Highlight } from "./Highlight";
import { SummaryLines } from "./SummaryLines";
import { MeetupBadge } from "./Meetup";
import { TrustBadge } from "./TrustBadge";
import { NewBadge } from "./NewMarks";
import { HEAD_PREFIX } from "@/lib/heads";
import { typeChip } from "@/lib/adSchedule";

/** 이 수를 넘긴 댓글 수는 제목 옆에 크게 */
const HOT_COMMENTS = 100;

export function PostCard({
  post,
  terms,
  showCategory = true,
  seenRoom,
  inHead,
  badge,
}: {
  post: PostCardData;
  /** 방 배지 (작가지망생방: 장르 작가 테스트 결과) */
  badge?: string;
  terms?: string[];
  showCategory?: boolean;
  /** 방·홈 목록에서만: 지난번 이후 새 글이면 NEW (Sprint 41) */
  seenRoom?: string;
  /** 말머리 탭(자랑·질문…) 안: 탭 이름과 겹치는 "[자랑]"·"잡담" 표시는 뺀다 */
  inHead?: boolean;
}) {
  const net = post.upvotes - post.downvotes;
  const title = inHead ? post.title.replace(HEAD_PREFIX, "") : post.title;
  // [행사]·[혜택] 글은 잡담이 아니라 그 말머리로 (10/24)
  const chip = typeChip(post.title, post.post_type);
  return (
    <Link href={`/posts/${post.id}`} className="card" data-post-id={post.id}>
      <article>
        <div className="card-top">
          {seenRoom && <NewBadge room={seenRoom} createdAt={post.created_at} />}
          {post.pinned_tab && !showCategory && <span className="badge badge-type">📌 고정</span>}
          {showCategory && <span className="badge badge-cat">{post.category.name}</span>}
          <TrustBadge tier={post.trust_tier} />
          {showCategory && chip && <span className="badge badge-type">{chip}</span>}
          {post.meetup && <MeetupBadge meetup={post.meetup} />}
          {post.source_kinds.includes("paper") ? (
            <span className="badge badge-src badge-src-paper">🎓 논문 출처</span>
          ) : post.source_kinds.includes("gov") ? (
            <span className="badge badge-src badge-src-gov">🏛 공공기관 출처</span>
          ) : null}
          {(post.human_comment_count ?? 0) > 0 && (
            <span className="badge badge-people" aria-label={`사람 댓글 ${post.human_comment_count}개`}>
              💬 {post.human_comment_count}
            </span>
          )}
          {post.disputed_count > 0 && <span className="badge badge-disputed">🛠 정정 제안 {post.disputed_count}</span>}
          {post.is_suppressed && (
            <span className="badge badge-pending" title="스팸·광고 패턴이 감지되어 노출 순위가 낮아진 글">
              ⚠ 광고 의심
            </span>
          )}
        </div>
        <div className={post.thumb_id ? "card-head has-thumb" : "card-head"}>
          <h2 className="card-title">
            <Highlight text={title} terms={terms} />
          </h2>
          {/* 유튜브 "1000만" 처럼 많이 모인 글은 제목 옆에 큰 숫자 (10/21) — 댓글 100개부터, 실제 숫자 그대로 */}
          {post.comment_count >= HOT_COMMENTS && <span className="badge-hot">💬 {post.comment_count.toLocaleString()}</span>}
          {post.thumb_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="card-thumb" src={smallThumbUrl(post.thumb_id)} alt="" width={64} height={64} loading="lazy" decoding="async" />
          )}
        </div>
        {post.products.length > 0 && (
          <p className="card-products">
            🏷 {post.products.map((p) => `${p.brand} ${p.name}`).join(" · ")}
          </p>
        )}
        {post.summary ? <SummaryLines lines={post.summary.lines} terms={terms} /> : null}
        {terms?.length ? (
          <p className="excerpt" style={{ marginTop: post.summary ? 8 : 0 }}>
            <Highlight text={snippet(post.excerpt, terms)} terms={terms} />
          </p>
        ) : !post.summary ? (
          <p className="excerpt">{post.excerpt}</p>
        ) : null}
        <div className="card-meta">
          {/* AI 글 표시는 아래 작성자 자리 한 곳에만 (위아래 중복이라는 운영자 피드백) — 🤖 표시는 그대로 */}
          {post.is_ai_curated ? (
            <span className="card-author-ai" title="AI 큐레이터가 작성한 글입니다.">
              🤖 AI 큐레이터
            </span>
          ) : (
            <span>{post.nickname}<NickBadge label={badge} /></span>
          )}
          <span>{timeAgo(post.created_at)}</span>
          <span className="spacer" />
          <span aria-label="순추천">▲ <b className="num">{net}</b></span>
          {post.view_count > 0 && <span aria-label="조회수">👁 <b className="num">{post.view_count}</b></span>}
          <span aria-label="댓글 수">💬 <b className="num">{post.comment_count}</b></span>
          {post.image_count > 0 && <span aria-label={`사진 ${post.image_count}장`}>📷 <b className="num">{post.image_count}</b></span>}
          {post.source_count > 0 && <span aria-label={`출처 ${post.source_count}개`}>📚 <b className="num">{post.source_count}</b></span>}
          {post.correction_count > 0 && <span aria-label={`정정 제안 ${post.correction_count}건`}>🛠 <b className="num">{post.correction_count}</b></span>}
        </div>
      </article>
    </Link>
  );
}
