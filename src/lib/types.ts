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
};

export type PostDetail = PostCard & {
  body: string;
  report_count: number;
  is_blinded: boolean;
  moderation_note: string;
  /** 법적 요청에 의한 임시조치 (정보통신망법 제44조의2) */
  legal_hold: boolean;
  legal_hold_reason: string | null;
  updated_at: string;
};

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
  status: "open" | "promoted" | "duplicate";
  promoted_category_slug: string | null;
  created_at: string;
};
