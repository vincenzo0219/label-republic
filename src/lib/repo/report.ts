/**
 * 개인화 리포트 — 관심 방은 브라우저(localStorage)에만 저장되고, 서버는 요청마다 받은 방 목록으로
 * 응답만 만든다. 사용자별 데이터를 저장하지 않으며, 같은 방 조합·시각이면 누구에게나 같은 응답이다.
 */
import { query } from "../db";
import type { PostCard } from "../types";
import { listNewPosts, listUpcomingMeetups } from "./posts";
import { watchUpdates, type WatchUpdates } from "./watch";

export const MAX_REPORT_BOARDS = 10;
const MAX_LOOKBACK_MS = 30 * 86400_000;
const DEFAULT_LOOKBACK_MS = 7 * 86400_000;

export type BoardDigest = {
  category_slug: string;
  category_name: string;
  headline: string;
  lines: string[];
  post_ids: string[];
  model_version: string;
  created_at: string;
};

export type Report = {
  boards: { slug: string; name: string; newCount: number }[];
  since: string;
  total: number;
  posts: PostCard[];
  meetups: PostCard[];
  digests: BoardDigest[];
  /** 관심 제품·지켜보는 글의 새 소식 */
  watch: WatchUpdates;
};

/** comments: 브라우저가 기억하는 내 댓글 번호 (답글·멘션, Sprint 30) */
export type Watched = { products: string[]; posts: string[]; comments?: string[]; fingerprint: string | null };
const NO_WATCH: Watched = { products: [], posts: [], fingerprint: null };

/** since 는 과거 30일 이내로 제한 (처음 방문자는 최근 7일) */
export function clampSince(raw: string | null | undefined, now = new Date()): Date {
  const t = raw ? Date.parse(raw) : NaN;
  if (Number.isNaN(t)) return new Date(now.getTime() - DEFAULT_LOOKBACK_MS);
  return new Date(Math.min(now.getTime(), Math.max(t, now.getTime() - MAX_LOOKBACK_MS)));
}

export function parseBoards(raw: string | null | undefined): string[] {
  return Array.from(new Set((raw ?? "").split(",").map((s) => s.trim()).filter((s) => s && s.length <= 60))).slice(0, MAX_REPORT_BOARDS);
}

async function resolveBoards(slugs: string[]) {
  if (!slugs.length) return [];
  return query<{ id: number; slug: string; name: string }>(
    "SELECT id, slug, name FROM categories WHERE slug = ANY($1::text[]) ORDER BY sort_order, id",
    [slugs],
  );
}

/** 헤더 배지용 가벼운 조회 — 새 글 + 관심 제품·지켜보는 글 새 소식 개수만 */
export async function countNew(slugs: string[], since: Date, watched: Watched = NO_WATCH): Promise<number> {
  const [boards, watch] = await Promise.all([
    countBoardPosts(slugs, since),
    watched.products.length || watched.posts.length || watched.comments?.length
      ? watchUpdates(watched.products, watched.posts, since, watched.fingerprint, { comments: watched.comments }).then((w) => w.total)
      : Promise.resolve(0),
  ]);
  return boards + watch;
}

async function countBoardPosts(slugs: string[], since: Date): Promise<number> {
  const cats = await resolveBoards(slugs);
  if (!cats.length) return 0;
  const rows = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM posts p
      WHERE NOT p.is_blinded AND NOT p.is_suppressed AND p.post_type <> 'chat'
        AND p.category_id = ANY($1::int[]) AND p.created_at > $2::timestamptz`,
    [cats.map((c) => c.id), since.toISOString()],
  );
  return rows[0]!.n;
}

export async function buildReport(slugs: string[], since: Date, now = new Date(), watched: Watched = NO_WATCH): Promise<Report> {
  const cats = await resolveBoards(slugs);
  const ids = cats.map((c) => c.id);
  const [newPosts, meetups, digests, perBoard, watch] = await Promise.all([
    listNewPosts(ids, since),
    listUpcomingMeetups(ids, now),
    ids.length
      ? query<BoardDigest>(
          `SELECT DISTINCT ON (d.category_id) c.slug AS category_slug, c.name AS category_name,
                  d.headline, d.lines, d.post_ids::text[] AS post_ids, d.model_version, d.created_at
             FROM board_digests d JOIN categories c ON c.id = d.category_id
            WHERE d.category_id = ANY($1::int[]) AND d.created_at > now() - interval '8 days'
            ORDER BY d.category_id, d.created_at DESC`,
          [ids],
        )
      : Promise.resolve([]),
    ids.length
      ? query<{ category_id: number; n: number }>(
          `SELECT category_id, count(*)::int AS n FROM posts p
            WHERE NOT p.is_blinded AND NOT p.is_suppressed AND p.post_type <> 'chat'
              AND p.category_id = ANY($1::int[]) AND p.created_at > $2::timestamptz
            GROUP BY category_id`,
          [ids, since.toISOString()],
        )
      : Promise.resolve([]),
    watchUpdates(watched.products, watched.posts, since, watched.fingerprint, { previews: true, comments: watched.comments }),
  ]);
  const counts = new Map(perBoard.map((r) => [r.category_id, r.n]));
  return {
    boards: cats.map((c) => ({ slug: c.slug, name: c.name, newCount: counts.get(c.id) ?? 0 })),
    since: since.toISOString(),
    total: newPosts.total,
    posts: newPosts.items,
    meetups,
    digests,
    watch,
  };
}

/** 방 페이지 상단용: 최근 8일 이내 최신 다이제스트 */
export async function latestDigest(categoryId: number): Promise<BoardDigest | null> {
  const rows = await query<BoardDigest>(
    `SELECT c.slug AS category_slug, c.name AS category_name, d.headline, d.lines, d.post_ids::text[] AS post_ids, d.model_version, d.created_at
       FROM board_digests d JOIN categories c ON c.id = d.category_id
      WHERE d.category_id = $1 AND d.created_at > now() - interval '8 days'
      ORDER BY d.created_at DESC LIMIT 1`,
    [categoryId],
  );
  return rows[0] ?? null;
}
