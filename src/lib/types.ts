export type TrustTier = "pending" | "none" | "top19" | "top12" | "top5";

export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string;
  post_count: number;
  auto_promoted_at: string | null;
};

export type Summary = {
  lines: [string, string, string];
  model_version: string;
  is_author_edited: boolean;
};

export type PostType = "info" | "chat" | "meetup";

export type Meetup = {
  meet_at: string;
  location: string;
  min_participants: number;
  capacity: number;
  rsvp_count: number;
  status: "proposed" | "confirmed" | "expired";
  confirmed_at: string | null;
};

export type PostCard = {
  id: string;
  category: { slug: string; name: string };
  nickname: string;
  title: string;
  excerpt: string;
  summary: Summary | null;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  trust_tier: TrustTier;
  is_ai_curated: boolean;
  /** AI 1차 정화로 노출 순위가 낮아진 글 */
  is_suppressed: boolean;
  post_type: PostType;
  meetup: Meetup | null;
  created_at: string;
  /** 첫 번째 첨부 이미지 (카드 썸네일) */
  thumb_id: string | null;
  image_count: number;
  source_count: number;
  /** 달린 출처의 종류 (paper·gov·community·web) */
  source_kinds: string[];
  /** 태그한 제품 (Sprint 14) */
  products: ProductTag[];
  /** 보이는 정정 제안 수 (철회 제외) */
  correction_count: number;
  /** 커뮤니티가 동의했는데 아직 반영되지 않은 정정 제안 수 */
  disputed_count: number;
};

export type ProductTag = { id: string; brand: string; name: string };

/** 글에 적은 제품 수치 (표시값·실측값) */
export type PostFact = { product_id: string; attribute: string; value: number; unit: string; basis: string; kind: "label" | "measured" };

export type PostSource = {
  id: string;
  url: string;
  host: string;
  kind: "paper" | "gov" | "community" | "web";
  label: string;
  page_title: string | null;
  status: "unchecked" | "ok" | "broken";
  checked_at: string | null;
};

export type PostImage = { id: string; alt: string; width: number; height: number; thumb_width: number; thumb_height: number };

export type PostDetail = PostCard & {
  images: PostImage[];
  sources: PostSource[];
  facts: PostFact[];
  body: string;
  report_count: number;
  is_blinded: boolean;
  moderation_note: string;
  /** 법적 요청에 의한 임시조치 (정보통신망법 제44조의2) */
  legal_hold: boolean;
  legal_hold_reason: string | null;
  updated_at: string;
  revision_count: number;
};

export type Correction = {
  id: string;
  post_id: string;
  nickname: string;
  target: "fact" | "text" | "other";
  quote: string;
  proposal: string;
  reason: string;
  source_url: string | null;
  source_host: string | null;
  source_kind: "paper" | "gov" | "community" | "web" | null;
  status: "open" | "applied" | "answered" | "withdrawn";
  author_note: string;
  agree_count: number;
  disagree_count: number;
  is_supported: boolean;
  created_at: string;
  resolved_at: string | null;
  /** 제안한 수치·문장이 지금 글에도 그대로 있는가 (고쳐졌으면 false) */
  target_current: boolean;
  my_vote: 1 | -1 | 0;
};

export type PostRevision = { id: string; title: string; body: string; facts: (PostFact & { product: string })[]; created_at: string; replaced_at: string };

export type Comment = {
  id: string;
  post_id: string;
  nickname: string;
  body: string;
  is_ai_curated: boolean;
  created_at: string;
};

export type BoardRequest = {
  id: string;
  requested_name: string;
  description: string;
  vote_count: number;
  status: "open" | "promoted" | "duplicate" | "rejected";
  /** 다른 요청에 병합된 경우 그 요청 번호 */
  merged_into: string | null;
  promoted_category_slug: string | null;
  created_at: string;
};
