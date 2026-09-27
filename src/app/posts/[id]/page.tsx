import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveComments } from "@/components/LiveComments";
import { PostOwnerActions } from "@/components/PostOwnerActions";
import { ReportButton } from "@/components/ReportButton";
import { SummaryLines } from "@/components/SummaryLines";
import { AiBadge, TrustBadge } from "@/components/TrustBadge";
import { VoteButtons } from "@/components/VoteButtons";
import { config } from "@/lib/config";
import { fingerprint } from "@/lib/fingerprint";
import { timeAgo } from "@/lib/format";
import { listComments } from "@/lib/repo/comments";
import { getMyVote, getPost } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).id);
  if (!post) return {};
  if (post.is_blinded) return { title: "블라인드된 게시글", robots: { index: false, follow: false } };
  const description = post.summary ? post.summary.lines.join(" ") : post.excerpt.slice(0, 160);
  return {
    title: `${post.title} — ${post.category.name}`,
    description,
    alternates: { canonical: `/posts/${post.id}` },
    openGraph: { type: "article", title: post.title, description, publishedTime: post.created_at, modifiedTime: post.updated_at },
    twitter: { card: "summary", title: post.title, description },
  };
}

export default async function PostPage({ params }: Props) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  if (post.is_blinded) {
    return (
      <>
        <p className="hint"><Link href={`/c/${encodeURIComponent(post.category.slug)}`}>← {post.category.name}</Link></p>
        <div className="notice" style={{ marginTop: 24 }}>
          🚫 신고 {post.report_count}회 누적으로 자동 블라인드된 게시글입니다. 라벨공화국은 방장 없이 커뮤니티 신고로만 정화됩니다.
        </div>
      </>
    );
  }

  const fp = fingerprint(await headers());
  const [comments, myVote] = await Promise.all([listComments(id), getMyVote(id, fp)]);

  // 검색엔진용 구조화 데이터 (SEO)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: post.title,
    text: post.body.slice(0, 5000),
    url: `${config.siteUrl}/posts/${post.id}`,
    datePublished: post.created_at,
    dateModified: post.updated_at,
    author: { "@type": post.is_ai_curated ? "Organization" : "Person", name: post.nickname },
    articleSection: post.category.name,
    commentCount: post.comment_count,
    interactionStatistic: [{ "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: post.upvotes }],
    comment: comments.slice(0, 20).map((c) => ({
      "@type": "Comment",
      text: c.body,
      datePublished: c.created_at,
      author: { "@type": "Person", name: c.nickname },
    })),
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="post-head">
        <div className="card-top">
          <Link href={`/c/${encodeURIComponent(post.category.slug)}`} className="badge badge-cat">{post.category.name}</Link>
          <TrustBadge tier={post.trust_tier} categoryName={post.category.name} />
          {post.is_ai_curated && <AiBadge />}
        </div>
        <h1>{post.title}</h1>
        <div className="post-meta">
          <span>{post.nickname}</span>
          <time dateTime={post.created_at}>{timeAgo(post.created_at)}</time>
          {post.updated_at !== post.created_at && <span>(수정됨)</span>}
        </div>
      </header>

      {post.summary && (
        <section className="ai-card" aria-label="3줄 요약">
          <h2>
            📌 3줄 요약
            <span>
              {post.summary.model_version === "author"
                ? "작성자 작성"
                : post.summary.is_author_edited
                  ? "AI 생성 · 작성자 수정"
                  : "AI 생성 · 작성자 검수"}
            </span>
          </h2>
          <SummaryLines lines={post.summary.lines} />
        </section>
      )}

      <div className="post-body">{post.body}</div>

      <VoteButtons postId={post.id} initial={{ upvotes: post.upvotes, downvotes: post.downvotes, myVote }} />

      <div className="post-actions">
        <PostOwnerActions postId={post.id} />
        <ReportButton postId={post.id} />
      </div>

      <LiveComments postId={post.id} initial={comments} />
    </article>
  );
}
