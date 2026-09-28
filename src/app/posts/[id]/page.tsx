import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppealBox } from "@/components/AppealBox";
import { CorrectionsPanel } from "@/components/CorrectionsPanel";
import { Gallery } from "@/components/Gallery";
import { LiveComments } from "@/components/LiveComments";
import { PostOwnerActions } from "@/components/PostOwnerActions";
import { PostFactsTable, ProductChips } from "@/components/PostProducts";
import { ReportButton } from "@/components/ReportButton";
import { RsvpPanel } from "@/components/RsvpPanel";
import { ShareButton } from "@/components/ShareButton";
import { SourceList } from "@/components/SourceList";
import { SummaryLines } from "@/components/SummaryLines";
import { AiBadge, TrustBadge } from "@/components/TrustBadge";
import { VoteButtons } from "@/components/VoteButtons";
import { WatchToggle } from "@/components/WatchToggle";
import { config } from "@/lib/config";
import { imageUrl } from "@/lib/media-url";
import { fingerprint } from "@/lib/fingerprint";
import { timeAgo } from "@/lib/format";
import { listComments } from "@/lib/repo/comments";
import { listCorrections } from "@/lib/repo/corrections";
import { FACT_KIND_LABEL, formatValue } from "@/lib/products";
import { LEGAL_HOLD_DAYS, LEGAL_REASONS, type LegalReason } from "@/lib/repo/legal";
import { isAttending, listParticipants } from "@/lib/repo/meetups";
import { getAppeal } from "@/lib/repo/operator";
import { getMyVote, getPost as getPostUncached } from "@/lib/repo/posts";
import { EXTRACTIVE_MODEL } from "@/lib/summary";

export const dynamic = "force-dynamic";

// generateMetadata 와 페이지가 같은 글을 읽으므로 요청 하나 안에서는 한 번만 조회한다
const getPost = cache(getPostUncached);

type Props = { params: Promise<{ id: string }> };

function summarySource(s: { model_version: string; is_author_edited: boolean }): string {
  if (s.model_version === "author") return "작성자 작성";
  const base = s.model_version === EXTRACTIVE_MODEL ? "자동 추출 요약" : "AI 생성";
  return s.is_author_edited ? `${base} · 작성자 수정` : base;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).id);
  if (!post) return {};
  if (post.is_blinded) return { title: "블라인드된 게시글", robots: { index: false, follow: false } };
  const description = post.summary ? post.summary.lines.join(" ") : post.excerpt.slice(0, 160);
  // 3줄 요약 카드 이미지를 링크 미리보기(OG)로 사용 — 광고 의심 글은 카드 이미지를 만들지 않는다
  const ogImage = post.is_suppressed ? null : { url: `/posts/${post.id}/card?format=og`, width: 1200, height: 630, alt: post.title };
  return {
    title: `${post.title} — ${post.category.name}`,
    description,
    alternates: { canonical: `/posts/${post.id}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      publishedTime: post.created_at,
      modifiedTime: post.updated_at,
      section: post.category.name,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: { card: ogImage ? "summary_large_image" : "summary", title: post.title, description, ...(ogImage ? { images: [ogImage.url] } : {}) },
    // 광고 의심 글과 잡담은 검색 노출에서 제외 (정보 아카이브로서의 SEO 품질 유지)
    ...(post.is_suppressed || post.post_type === "chat" ? { robots: { index: false, follow: !post.is_suppressed } } : {}),
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
        <h1 className="sr-only">{post.legal_hold ? "임시조치된 게시글" : "블라인드된 게시글"}</h1>
        {post.legal_hold ? (
          <div className="notice" style={{ marginTop: 24 }}>
            ⚖️ 권리침해 신고({LEGAL_REASONS[post.legal_hold_reason as LegalReason] ?? "법적 요청"})에 따라 정보통신망법 제44조의2에 의거 임시조치된
            게시글입니다. 임시조치는 최대 {LEGAL_HOLD_DAYS}일이며, 모든 조치는 <Link href="/transparency">투명성 기록</Link>에 공개됩니다.
          </div>
        ) : (
          <>
            <div className="notice" style={{ marginTop: 24 }}>
              🚫 신고 {post.report_count}회 누적으로 자동 블라인드된 게시글입니다. 라벨공화국은 방장 없이 커뮤니티 신고로만 정화됩니다.
            </div>
            {!post.is_ai_curated && <AppealBox postId={post.id} initial={await getAppeal(post.id)} />}
          </>
        )}
      </>
    );
  }

  const fp = fingerprint(await headers());
  const [comments, myVote, participants, attending, appeal, corrections] = await Promise.all([
    listComments(id),
    getMyVote(id, fp),
    post.meetup ? listParticipants(id) : Promise.resolve([]),
    post.meetup ? isAttending(id, fp) : Promise.resolve(false),
    post.is_suppressed && !post.is_ai_curated ? getAppeal(id) : Promise.resolve(null),
    listCorrections(id, fp),
  ]);
  const productName = new Map(post.products.map((p) => [p.id, `${p.brand} ${p.name}`]));
  const factLabels = post.facts.map(
    (f) => `${productName.get(f.product_id) ?? ""} · ${f.attribute} ${formatValue(f.value)} ${f.unit}${f.basis ? ` (${f.basis})` : ""} · ${FACT_KIND_LABEL[f.kind]}`,
  );

  // 검색엔진용 구조화 데이터 (SEO) — 정모는 Event 로 표시
  const jsonLd = post.meetup
    ? {
        "@context": "https://schema.org",
        "@type": "Event",
        name: post.title,
        description: post.body.slice(0, 500),
        startDate: post.meetup.meet_at,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: post.meetup.location },
        organizer: { "@type": "Person", name: post.nickname },
        maximumAttendeeCapacity: post.meetup.capacity,
        url: `${config.siteUrl}/posts/${post.id}`,
      }
    : {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: post.title,
    text: post.body.slice(0, 5000),
    ...(post.images.length ? { image: post.images.map((i) => `${config.siteUrl}${imageUrl(i.id)}`) } : {}),
    ...(post.sources.length ? { citation: post.sources.map((s) => s.url) } : {}),
    ...(post.products.length
      ? { about: post.products.map((p) => ({ "@type": "Product", name: `${p.brand} ${p.name}`, brand: { "@type": "Brand", name: p.brand }, url: `${config.siteUrl}/p/${p.id}` })) }
      : {}),
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
      author: { "@type": c.is_ai_curated ? "Organization" : "Person", name: c.nickname },
    })),
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="post-head">
        <div className="card-top">
          <Link href={`/c/${encodeURIComponent(post.category.slug)}`} className="badge badge-cat">{post.category.name}</Link>
          <TrustBadge tier={post.trust_tier} categoryName={post.category.name} />
          {post.post_type === "chat" && <span className="badge badge-type">💬 잡담</span>}
          {post.is_ai_curated && <AiBadge />}
        </div>
        <h1>{post.title}</h1>
        <div className="post-meta">
          <span>{post.nickname}</span>
          <time dateTime={post.created_at}>{timeAgo(post.created_at)}</time>
          {post.revision_count > 0 ? (
            <Link href={`/posts/${post.id}/history`}>수정 이력 {post.revision_count}</Link>
          ) : (
            post.updated_at !== post.created_at && <span>(수정됨)</span>
          )}
        </div>
        <ProductChips products={post.products} />
      </header>

      {post.disputed_count > 0 && (
        <div className="notice notice-disputed" role="note" style={{ marginTop: 12 }}>
          🛠 커뮤니티가 동의한 <a href="#corrections">정정 제안 {post.disputed_count}건</a>이 아직 반영되지 않았습니다. 본문과 함께 확인하세요. 반영될 때까지 이 글은
          신뢰도 상위 배지를 받지 못하고, 해당 수치는 제품 페이지 집계에서 빠집니다.
        </div>
      )}

      {post.is_ai_curated && (
        <div className="notice" style={{ marginTop: 12 }}>
          🤖 초기 커뮤니티를 위해 AI 큐레이터가 작성한 정보 글입니다. 사실과 다른 부분은 댓글과 비추천·신고로 바로잡아 주세요.
        </div>
      )}

      {post.is_suppressed && (
        <div className="notice" style={{ marginTop: 12 }}>
          ⚠ 스팸·광고 패턴이 감지되어 노출 순위가 낮아진 글입니다{post.moderation_note ? ` (${post.moderation_note})` : ""}. 판단은
          추천/비추천과 신고로 커뮤니티가 최종 결정합니다.
          {!post.is_ai_curated && <AppealBox postId={post.id} initial={appeal} />}
        </div>
      )}

      {post.meetup && <RsvpPanel postId={post.id} initial={post.meetup} participants={participants} attending={attending} />}

      {post.summary && (
        <section className="ai-card" aria-label="3줄 요약">
          <h2>
            📌 3줄 요약
            <span>{summarySource(post.summary)}</span>
          </h2>
          <SummaryLines lines={post.summary.lines} />
        </section>
      )}

      <div className="post-body">{post.body}</div>
      <Gallery images={post.images} />
      <PostFactsTable products={post.products} facts={post.facts} />
      <SourceList sources={post.sources} />

      <VoteButtons postId={post.id} initial={{ upvotes: post.upvotes, downvotes: post.downvotes, myVote }} />

      <div className="post-actions">
        <ShareButton postId={post.id} title={post.title} />
        <WatchToggle kind="post" id={post.id} name={post.title} />
        {!post.is_ai_curated && <PostOwnerActions postId={post.id} />}
        <ReportButton postId={post.id} />
      </div>

      <CorrectionsPanel postId={post.id} facts={factLabels} initial={corrections} hasAuthor={!post.is_ai_curated} />

      <LiveComments postId={post.id} initial={comments} />
    </article>
  );
}
