/**
 * 지표 트래킹 — 검색 유입 → 게시글 조회 → 참여 → 재방문 (기획안의 핵심 지표 우선순위)
 *
 * 개인정보 최소화:
 * - 방문자는 무작위 1st-party 쿠키(lr_vid) 값을 HMAC 한 값으로만 식별한다. IP·UA는 저장하지 않는다.
 * - 레퍼러는 호스트만 저장한다 (전체 URL·검색어 쿼리스트링 미저장).
 * - JS 비콘으로만 수집하므로 대부분의 크롤러는 집계되지 않는다.
 */
import { createHmac, randomUUID } from "node:crypto";
import { config } from "./config";
import { query } from "./db";

export type TrafficSource = "search" | "social" | "referral" | "direct" | "internal";

// 국가별 도메인(google.co.kr 등)은 허용하되 google.com.evil.io 같은 위장 호스트는 제외하도록 TLD 형태를 고정한다.
const CC = "(?:com|[a-z]{2}|co\\.[a-z]{2}|com\\.[a-z]{2})";
const SEARCH_HOSTS = new RegExp(
  `(^|\\.)(google\\.${CC}|naver\\.com|daum\\.net|bing\\.com|yahoo\\.${CC}|duckduckgo\\.com|zum\\.com|ecosia\\.org|baidu\\.com|yandex\\.(?:ru|com))$`,
  "i",
);
const SOCIAL_HOSTS = /(^|\.)(kakao\.com|kakaocdn\.net|t\.co|x\.com|twitter\.com|facebook\.com|fb\.me|instagram\.com|threads\.net|reddit\.com|youtube\.com|band\.us|tiktok\.com|linkedin\.com)$/i;
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|kakaotalk-scrap|yeti|daum/i;

export function referrerHost(referrer: string | undefined | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase().slice(0, 120) || null;
  } catch {
    return null;
  }
}

/** 첫 페이지 로드(landing)의 레퍼러로 유입 경로를 분류한다. 이후 사이트 내 이동은 internal. */
export function classifySource(opts: { landing: boolean; referrer?: string | null; siteHost: string }): { source: TrafficSource; host: string | null } {
  if (!opts.landing) return { source: "internal", host: null };
  const host = referrerHost(opts.referrer);
  if (!host) return { source: "direct", host: null };
  if (host === opts.siteHost.toLowerCase().replace(/:\d+$/, "")) return { source: "internal", host };
  if (SEARCH_HOSTS.test(host)) return { source: "search", host };
  if (SOCIAL_HOSTS.test(host)) return { source: "social", host };
  return { source: "referral", host };
}

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}

export type ParsedPath = { path: string; postId: string | null; categorySlug: string | null; searchQuery: string | null };

export function parsePath(raw: string): ParsedPath | null {
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(raw, "http://x");
  } catch {
    return null;
  }
  const p = url.pathname;
  if (p.startsWith("/admin") || p.startsWith("/api") || p.startsWith("/_next")) return null;
  const post = p.match(/^\/posts\/(\d{1,18})$/);
  const cat = p.match(/^\/c\/([^/]+)$/);
  let slug: string | null = null;
  if (cat) {
    try {
      slug = decodeURIComponent(cat[1]!).slice(0, 60);
    } catch {
      slug = null;
    }
  }
  const q = p === "/search" ? url.searchParams.get("q")?.trim().slice(0, 100) || null : null;
  return { path: p.slice(0, 300), postId: post ? post[1]! : null, categorySlug: slug, searchQuery: q };
}

export const VISITOR_COOKIE = "lr_vid";

export function newVisitorId(): string {
  return randomUUID();
}

export function visitorHash(visitorId: string): string {
  return createHmac("sha256", config.appSecret).update(`vid:${visitorId}`).digest("hex");
}

/** 한국 시간 기준 날짜 (YYYY-MM-DD) */
export function kstDay(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export type PageViewInput = {
  visitorHash: string;
  path: ParsedPath;
  source: TrafficSource;
  referrerHost: string | null;
  landing: boolean;
  now?: Date;
};

/** 조회 1건 기록 + 방문자 재방문 판정 + 게시글 조회수 증가 */
export async function recordPageView(input: PageViewInput): Promise<{ isReturning: boolean }> {
  const now = input.now ?? new Date();
  const day = kstDay(now);
  // 방문자 upsert: 날짜가 바뀌었으면 visit_days + 1. 반환값의 prev_day 로 "이전 날짜에 온 적 있는지" 판정.
  const v = await query<{ first_day: string }>(
    `WITH prev AS (SELECT (first_seen AT TIME ZONE 'Asia/Seoul')::date AS first_day FROM visitors WHERE visitor_hash = $1)
     INSERT INTO visitors (visitor_hash, first_seen, last_seen, last_day, visit_days)
     VALUES ($1, $2, $2, $3::date, 1)
     ON CONFLICT (visitor_hash) DO UPDATE
       SET last_seen = EXCLUDED.last_seen,
           visit_days = visitors.visit_days + (visitors.last_day < EXCLUDED.last_day)::int,
           last_day = GREATEST(visitors.last_day, EXCLUDED.last_day)
     RETURNING (SELECT first_day FROM prev)::text AS first_day`,
    [input.visitorHash, now.toISOString(), day],
  );
  const firstDay = v[0]?.first_day ?? null;
  const isReturning = firstDay !== null && firstDay < day;
  await query(
    `INSERT INTO page_views (occurred_at, day, visitor_hash, is_returning, path, post_id, category_slug, source, referrer_host, is_landing, search_query)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      now.toISOString(),
      day,
      input.visitorHash,
      isReturning,
      input.path.path,
      input.path.postId,
      input.path.categorySlug,
      input.source,
      input.referrerHost,
      input.landing,
      input.path.searchQuery,
    ],
  );
  if (input.path.postId) {
    await query("UPDATE posts SET view_count = view_count + 1 WHERE id = $1", [input.path.postId]);
  }
  return { isReturning };
}
