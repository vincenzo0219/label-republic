import Link from "next/link";
import { snippet } from "@/lib/highlight";
import { thumbUrl } from "@/lib/media-url";
import { timeAgo } from "@/lib/format";
import type { PostCard as PostCardData } from "@/lib/types";
import { Highlight } from "./Highlight";
import { SummaryLines } from "./SummaryLines";
import { MeetupBadge } from "./Meetup";
import { AiBadge, TrustBadge } from "./TrustBadge";

export function PostCard({ post, terms, showCategory = true }: { post: PostCardData; terms?: string[]; showCategory?: boolean }) {
  const net = post.upvotes - post.downvotes;
  return (
    <Link href={`/posts/${post.id}`} className="card">
      <article>
        <div className="card-top">
          {showCategory && <span className="badge badge-cat">{post.category.name}</span>}
          <TrustBadge tier={post.trust_tier} />
          {post.post_type === "chat" && <span className="badge badge-type">💬 잡담</span>}
          {post.meetup && <MeetupBadge meetup={post.meetup} />}
          {post.is_ai_curated && <AiBadge />}
          {post.is_suppressed && (
            <span className="badge badge-pending" title="스팸·광고 패턴이 감지되어 노출 순위가 낮아진 글">
              ⚠ 광고 의심
            </span>
          )}
        </div>
        <div className={post.thumb_id ? "card-head has-thumb" : "card-head"}>
          <h2 className="card-title">
            <Highlight text={post.title} terms={terms} />
          </h2>
          {post.thumb_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="card-thumb" src={thumbUrl(post.thumb_id)} alt="" width={64} height={64} loading="lazy" decoding="async" />
          )}
        </div>
        {post.summary ? <SummaryLines lines={post.summary.lines} terms={terms} /> : null}
        {terms?.length ? (
          <p className="excerpt" style={{ marginTop: post.summary ? 8 : 0 }}>
            <Highlight text={snippet(post.excerpt, terms)} terms={terms} />
          </p>
        ) : !post.summary ? (
          <p className="excerpt">{post.excerpt}</p>
        ) : null}
        <div className="card-meta">
          <span>{post.nickname}</span>
          <span>{timeAgo(post.created_at)}</span>
          <span className="spacer" />
          <span aria-label="순추천">▲ {net}</span>
          <span aria-label="댓글 수">💬 {post.comment_count}</span>
          {post.image_count > 0 && <span aria-label={`사진 ${post.image_count}장`}>📷 {post.image_count}</span>}
        </div>
      </article>
    </Link>
  );
}
