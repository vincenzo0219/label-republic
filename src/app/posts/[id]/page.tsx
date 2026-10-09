import type { Metadata } from "next";
import { abuseLabel } from "@/lib/abuse-labels";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppealBox } from "@/components/AppealBox";
import { CorrectionsPanel } from "@/components/CorrectionsPanel";
import { FirstVisitIntro } from "@/components/FirstVisitIntro";
import { Gallery } from "@/components/Gallery";
import { FollowCta } from "@/components/FollowLinks";
import { LiveComments } from "@/components/LiveComments";
import { PostOwnerActions } from "@/components/PostOwnerActions";
import { PostFactsTable, PostProductDatesList, ProductChips } from "@/components/PostProducts";
import { getRules } from "@/lib/repo/rules";
import { ReportButton } from "@/components/ReportButton";
import { RsvpPanel } from "@/components/RsvpPanel";
import { SaveOffline } from "@/components/SaveOffline";
import { ShareButton } from "@/components/ShareButton";
import { SourceList } from "@/components/SourceList";
import { SummaryLines } from "@/components/SummaryLines";
import { TrustBadge } from "@/components/TrustBadge";
import { VoteButtons } from "@/components/VoteButtons";
import { WatchToggle } from "@/components/WatchToggle";
import { config } from "@/lib/config";
import { imageUrl } from "@/lib/media-url";
import { CRAWLER_HEADER, fingerprint } from "@/lib/fingerprint";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { WELCOME_COOKIE } from "@/lib/onboarding";
import { visitorHomeState } from "@/lib/repo/survey";
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
  // 블라인드·임시조치 글은 서비스 워커가 기기에 저장하지 않고, 저장돼 있던 것도 지운다 (Sprint 19)
  if (post.is_blinded) return { title: "블라인드된 게시글", robots: { index: false, follow: false }, other: { "lr-offline": "no-store" } };
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
        <h1 className="sr-only">{post.legal_hold ? "임시조치된 게시글" : post.ai_hidden_reason ? "AI가 가린 게시글" : "블라인드된 게시글"}</h1>
        {post.legal_hold ? (
          <div className="notice" style={{ marginTop: 24 }}>
            ⚖️ 권리침해 신고({LEGAL_REASONS[post.legal_hold_reason as LegalReason] ?? "법적 요청"})에 따라 정보통신망법 제44조의2에 의거 임시조치된
            게시글입니다. 임시조치는 최대 {LEGAL_HOLD_DAYS}일이며, 모든 조치는 <Link href="/transparency">투명성 기록</Link>에 공개됩니다.
          </div>
        ) : (
          <>
            {post.ai_hidden_reason ? (
              <div className="notice" style={{ marginTop: 24 }}>
                🤖 AI 자동 운영이 <b>{abuseLabel(post.ai_hidden_reason)}</b>이(가) 담긴 것으로 판단해 가린 게시글입니다.
                욕설·혐오 표현·인신공격·개인정보는 사람 운영자 없이 AI가 가리고, 오판이면 작성자가 아래에서 재검토를 요청할 수 있습니다.
                운영자가 푼 기록은 <Link href="/transparency">투명성 기록</Link>에 공개됩니다.
              </div>
            ) : (
              <div className="notice" style={{ marginTop: 24 }}>
                🚫 신고 {post.report_count}회 누적으로 자동 블라인드된 게시글입니다. 노방장은 방장 없이 커뮤니티 신고로만 정화됩니다.
              </div>
            )}
            {!post.is_ai_curated && <AppealBox postId={post.id} initial={await getAppeal(post.id)} />}
          </>
        )}
      </>
    );
  }

  const fp = fingerprint(await headers());
  const [comments, myVote, participants, attending, appeal, corrections, rules] = await Promise.all([
    listComments(id),
    getMyVote(id, fp),
    post.meetup ? listParticipants(id) : Promise.resolve([]),
    post.meetup ? isAttending(id, fp) : Promise.resolve(false),
    post.is_suppressed && !post.is_ai_curated ? getAppeal(id) : Promise.resolve(null),
    listCorrections(id, fp),
    getRules(),
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

  // 첫 방문(홈 안내를 닫지 않았고 둘째 날 전)이면 글 위에 한 줄 소개 — 홈과 같은 기준 (Sprint 48)
  const [hdrs, jar] = await Promise.all([headers(), cookies()]);
  const vid = jar.get(VISITOR_COOKIE)?.value;
  const firstVisit =
    hdrs.get(CRAWLER_HEADER) !== "1" &&
    !jar.has(WELCOME_COOKIE) &&
    (!vid || !/^[0-9a-f-]{36}$/.test(vid) || ((await visitorHomeState(visitorHash(vid)).catch(() => null))?.visitDays ?? 0) < 2);

  return (
    <article>
      {firstVisit && <FirstVisitIntro />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="post-head">
        <div className="card-top">
          <Link href={`/c/${encodeURIComponent(post.category.slug)}`} className="badge badge-cat">{post.category.name}</Link>
          <TrustBadge tier={post.trust_tier} categoryName={post.category.name} />
          {post.post_type === "chat" && <span className="badge badge-type">💬 잡담</span>}
        </div>
        <h1>{post.title}</h1>
        <div className="post-meta">
          {/* AI 글 표시는 작성자 자리 한 곳에 (배지·작성자·안내에 세 번 나오던 것을 줄임) */}
          {post.is_ai_curated ? <span className="card-author-ai">🤖 AI 큐레이터</span> : <span>{post.nickname}</span>}
          <time dateTime={post.created_at}>{timeAgo(post.created_at)}</time>
          {post.revision_count > 0 ? (
            <Link href={`/posts/${post.id}/history`}>수정 이력 {post.revision_count}</Link>
          ) : (
            post.updated_at !== post.created_at && <span>(수정됨)</span>
          )}
        </div>
        <ProductChips products={post.products} />
        <PostProductDatesList products={post.products} dates={post.product_dates} photos={post.images} />
      </header>

      {post.disputed_count > 0 && (
        <div className="notice notice-disputed" role="note" style={{ marginTop: 12 }}>
          🛠 커뮤니티가 동의한 <a href="#corrections">정정 제안 {post.disputed_count}건</a>이 아직 반영되지 않았습니다. 본문과 함께 확인하세요. 반영될 때까지 이 글은
          신뢰도 상위 배지를 받지 못하고, 해당 수치는 제품 페이지 집계에서 빠집니다.
        </div>
      )}

      {/* AI 글 안내는 한 줄로 (작성자 자리에 이미 🤖 AI 큐레이터) */}
      {post.is_ai_curated && post.post_type === "chat" && <p className="hint ai-note">AI는 댓글을 달지 않아요 — 경험을 편하게 들려주세요.</p>}
      {post.is_ai_curated && post.post_type !== "chat" && (
        <p className="hint ai-note">
          {post.ai_reviewed ? "사람이 사실관계를 확인한 글이에요." : "사람이 검수하지 않은 글이에요."} 틀린 곳은 <a href="#corrections">정정 제안</a>으로 알려 주세요.
        </p>
      )}

      {post.is_suppressed && (
        <div className="notice" style={{ marginTop: 12 }}>
          ⚠ 스팸·광고 패턴이 감지되어 노출 순위가 낮아진 글입니다{post.moderation_note ? ` (${post.moderation_note})` : ""}. 판단은
          추천/비추천과 신고로 커뮤니티가 최종 결정합니다.
          {!post.is_ai_curated && <AppealBox postId={post.id} initial={appeal} />}
        </div>
      )}

      {post.meetup && <RsvpPanel postId={post.id} initial={post.meetup} participants={participants} attending={attending} />}

      {/* 잡담은 짧은 질문이라 요약이 본문을 밀어내기만 한다 (Sprint 48) */}
      {post.summary && post.post_type !== "chat" && (
        <section className="ai-card" aria-label="3줄 요약">
          <h2>
            📌 3줄 요약
            {!post.is_ai_curated && <span>{summarySource(post.summary)}</span>}
          </h2>
          <SummaryLines lines={post.summary.lines} />
        </section>
      )}

      <div className="post-body">{post.body}</div>
      <Gallery images={post.images} />
      <PostFactsTable products={post.products} facts={post.facts} photos={post.images} />
      <SourceList sources={post.sources} />

      <VoteButtons postId={post.id} initial={{ upvotes: post.upvotes, downvotes: post.downvotes, myVote }} />

      <div className="post-actions">
        <ShareButton postId={post.id} title={post.title} />
        <WatchToggle kind="post" id={post.id} name={post.title} />
        <SaveOffline postId={post.id} />
        {!post.is_ai_curated && <PostOwnerActions postId={post.id} />}
        <ReportButton postId={post.id} blindAt={rules.post_blind_reports} />
      </div>

      {/* 잡담에는 고칠 "사실"이 없으니 정정 제안 대신 댓글로 (이미 달린 정정은 보인다) */}
      {(post.post_type !== "chat" || corrections.items.length > 0 || corrections.hidden > 0) && (
      <CorrectionsPanel
        postId={post.id}
        facts={factLabels}
        initial={corrections}
        hasAuthor={!post.is_ai_curated}
        rules={{ supportScore: rules.correction_support_score, supportRatio: rules.correction_support_ratio, hideReports: rules.correction_hide_reports }}
      />
      )}

      <LiveComments postId={post.id} initial={comments} casual={post.post_type !== "info"} />
      <FollowCta />
    </article>
  );
}
