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
  created_at: string;
};

export type PostDetail = PostCard & {
  body: string;
  report_count: number;
  is_blinded: boolean;
  updated_at: string;
};

export type Comment = {
  id: string;
  post_id: string;
  nickname: string;
  body: string;
  created_at: string;
};

export type BoardRequest = {
  id: string;
  requested_name: string;
  description: string;
  vote_count: number;
  status: "open" | "promoted";
  promoted_category_slug: string | null;
  created_at: string;
};
