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
const SOCIAL_HOSTS = /(^|\.)(kakao\.com|kakaocdn\.net|t\.co|x\.com|twitter\.com|facebook\.com|fb\.me|instagram\.com|threads\.net|threads\.com|reddit\.com|youtube\.com|band\.us|tiktok\.com|linkedin\.com)$/i;
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|kakaotalk-scrap|yeti|daum/i;

export function referrerHost(referrer: string | undefined | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase().slice(0, 120) || null;
  } catch {
    return null;
  }
}

/** 우리가 SNS에 단 링크의 ?from= 값 — 앱 안 브라우저가 레퍼러를 지워도 어디서 왔는지 알 수 있게 (정해진 값만) */
const FROM_TAGS: Record<string, string> = { threads: "threads.com", instagram: "instagram.com" };

/** ?from=share 로 들어온 방문의 유입 호스트 자리 (관리자 SNS별 유입에 이 이름으로) */
export const SHARE_HOST = "공유 링크(from=share)";

/** 첫 페이지 로드(landing)의 레퍼러로 유입 경로를 분류한다. 이후 사이트 내 이동은 internal. */
export function classifySource(opts: { landing: boolean; referrer?: string | null; siteHost: string; from?: string | null }): { source: TrafficSource; host: string | null } {
  if (!opts.landing) return { source: "internal", host: null };
  const tagged = opts.from ? FROM_TAGS[opts.from.toLowerCase()] : undefined;
  if (tagged) return { source: "social", host: tagged };
  // 자매 서비스 아이볼(ibol.kr)의 "후기·수다 → 노방장" 카드 (/kids/<id>?from=ibol, 10/24)
  if (opts.from?.toLowerCase() === "ibol") return { source: "referral", host: "ibol.kr" };
  // 🙋 행사 글 공유 버튼 (?from=share, 10/26): 카톡 등 앱 안 브라우저가 레퍼러를 지워도 "공유 링크"로 센다
  if (opts.from?.toLowerCase() === "share") return { source: "social", host: SHARE_HOST };
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

export type ParsedPath = { path: string; postId: string | null; categorySlug: string | null; searchQuery: string | null; tab?: string | null };

const TAB_VALUE = /^[\p{L}\p{N}_-]{1,24}$/u;
/** 방 주소의 탭 (10/29 "탭 클릭수도 세줘"): ?head=심리 → "head:심리", ?tab=meet → "tab:meet", ?type=info → "type:info". 없으면 null(기본 탭) */
export function roomTabKey(params: URLSearchParams): string | null {
  for (const k of ["head", "tab", "type"] as const) {
    const v = params.get(k)?.trim();
    if (v && TAB_VALUE.test(v)) return `${k}:${v}`;
  }
  return null;
}

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
  return { path: p.slice(0, 300), postId: post ? post[1]! : null, categorySlug: slug, searchQuery: q, tab: slug ? roomTabKey(url.searchParams) : null };
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

/**
 * 첫 페이지 주소의 광고 표시 → 광고 이름 (10/28). utm_campaign 이 있으면 그것, 없으면 from=ig_ad&c=cheer 같은 예전 표시를 "ig_ad:cheer" 로.
 * 광고가 아니면 null. 글자는 영문·숫자·_·-·: 만, 60자까지
 */
export function adCampaign(rawPath: string): string | null {
  let sp: URLSearchParams;
  try {
    sp = new URL(rawPath, "http://x").searchParams;
  } catch {
    return null;
  }
  const clean = (v: string) => v.toLowerCase().replace(/[^a-z0-9_:-]/g, "").slice(0, 60) || null;
  const utm = sp.get("utm_campaign");
  if (utm) return clean(utm);
  const from = sp.get("from")?.toLowerCase();
  if (from && /_ad$/.test(from)) return clean(`${from}:${sp.get("c") ?? "-"}`);
  return null;
}

export type PageViewInput = {
  visitorHash: string;
  path: ParsedPath;
  source: TrafficSource;
  referrerHost: string | null;
  landing: boolean;
  /** 광고로 들어온 첫 페이지면 광고 이름 (adCampaign) */
  campaign?: string | null;
  now?: Date;
};

// 게시글 조회수는 요청마다 UPDATE 하지 않고 모아서 주기적으로 반영한다.
// 인기 글 한 행에 조회마다 행 잠금·갱신이 몰리는 것을 피하기 위함. 여러 인스턴스여도 덧셈이라 안전하고,
// 비정상 종료 시 마지막 몇 초분의 조회수만 잃는다.
// server.ts(tsx)와 Next 번들이 이 모듈을 따로 불러오므로 globalThis 에 하나만 둔다.
const gv = globalThis as unknown as { __labelRepPendingViews?: Map<string, number> };
const pendingViews = (gv.__labelRepPendingViews ??= new Map<string, number>());

/** 목록에서 화면에 보인 글도 한 번씩 센다 (Sprint 96, 카톡 "읽음"처럼). 브라우저가 글마다 한 번만 보낸다 */
export function addSeen(ids: string[]) {
  for (const id of ids) pendingViews.set(id, (pendingViews.get(id) ?? 0) + 1);
}

/** 모아 둔 조회수를 DB에 반영 (server.ts 가 주기적으로, 그리고 종료 시 호출) */
export async function flushViewCounts(): Promise<number> {
  if (!pendingViews.size) return 0;
  const entries = [...pendingViews.entries()];
  pendingViews.clear();
  try {
    await query(
      `UPDATE posts p SET view_count = p.view_count + v.n
         FROM unnest($1::bigint[], $2::int[]) AS v(id, n) WHERE p.id = v.id`,
      [entries.map(([id]) => id), entries.map(([, n]) => n)],
    );
  } catch (err) {
    // 실패하면 다음 주기에 다시 시도
    for (const [id, n] of entries) pendingViews.set(id, (pendingViews.get(id) ?? 0) + n);
    throw err;
  }
  return entries.length;
}

/** 조회 1건 기록 + 방문자 재방문 판정 (+ 게시글 조회수는 버퍼에 누적) — 왕복 1회 */
export async function recordPageView(input: PageViewInput): Promise<{ isReturning: boolean }> {
  const now = input.now ?? new Date();
  const day = kstDay(now);
  // 방문자 upsert: 날짜가 바뀌었으면 visit_days + 1. prev 의 첫 방문일로 "이전 날짜에 온 적 있는지" 판정.
  const rows = await query<{ is_returning: boolean }>(
    `WITH prev AS (SELECT (first_seen AT TIME ZONE 'Asia/Seoul')::date AS first_day FROM visitors WHERE visitor_hash = $1),
     v AS (
       INSERT INTO visitors (visitor_hash, first_seen, last_seen, last_day, visit_days)
       VALUES ($1, $2, $2, $3::date, 1)
       ON CONFLICT (visitor_hash) DO UPDATE
         SET last_seen = EXCLUDED.last_seen,
             visit_days = visitors.visit_days + (visitors.last_day < EXCLUDED.last_day)::int,
             last_day = GREATEST(visitors.last_day, EXCLUDED.last_day)
       RETURNING coalesce((SELECT first_day FROM prev) < $3::date, false) AS is_returning
     ),
     pv AS (
       INSERT INTO page_views (occurred_at, day, visitor_hash, is_returning, path, post_id, category_slug, source, referrer_host, is_landing, search_query, campaign, tab)
       SELECT $2, $3::date, $1, v.is_returning, $4, $5, $6, $7, $8, $9, $10, $11, $12 FROM v
     )
     SELECT is_returning FROM v`,
    [
      input.visitorHash,
      now.toISOString(),
      day,
      input.path.path,
      input.path.postId,
      input.path.categorySlug,
      input.source,
      input.referrerHost,
      input.landing,
      input.path.searchQuery,
      input.landing ? (input.campaign ?? null) : null,
      input.path.tab ?? null,
    ],
  );
  if (input.path.postId) {
    pendingViews.set(input.path.postId, (pendingViews.get(input.path.postId) ?? 0) + 1);
  }
  return { isReturning: rows[0]?.is_returning ?? false };
}

/** ⏱ 페이지를 떠날 때 비콘 한 번 (10/29): 머문 시간·스크롤 깊이·지나친 표시 */
export async function recordDwell(input: { visitorHash: string; path: string; categorySlug: string | null; tab?: string | null; ms: number; scrollPct: number; marks: string[]; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  await query(
    "INSERT INTO page_dwell (occurred_at, day, visitor_hash, path, category_slug, ms, scroll_pct, marks, tab) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [now.toISOString(), kstDay(now), input.visitorHash, input.path, input.categorySlug, input.ms, input.scrollPct, input.marks, input.tab ?? null],
  );
}

export type DwellRow = { path: string; category_slug: string | null; views: number; median_s: number; avg_scroll: number; marks: Record<string, number> };

/** ⏱ 페이지별 체류시간 (중앙값 초)·평균 스크롤·표시까지 내려간 비율(%) — 많이 본 순 */
export async function dwellStats(fromDay: string, toDay: string, opts: { path?: string; limit?: number } = {}): Promise<DwellRow[]> {
  const args = [fromDay, toDay, opts.path ?? null];
  const rows = await query<Omit<DwellRow, "marks">>(
    `SELECT path, max(category_slug) AS category_slug, count(*)::int AS views,
            round((percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) / 1000)::numeric, 1)::float AS median_s,
            round(avg(scroll_pct))::int AS avg_scroll
       FROM page_dwell WHERE day BETWEEN $1 AND $2 AND ($3::text IS NULL OR path = $3)
      GROUP BY path ORDER BY views DESC LIMIT $4`,
    [...args, opts.limit ?? 15],
  );
  if (!rows.length) return [];
  const marks = await query<{ path: string; m: string; n: number }>(
    `SELECT path, m, count(*)::int AS n FROM page_dwell, unnest(marks) m
      WHERE day BETWEEN $1 AND $2 AND path = ANY($3::text[]) GROUP BY path, m`,
    [fromDay, toDay, rows.map((r) => r.path)],
  );
  return rows.map((r) => ({
    ...r,
    marks: Object.fromEntries(marks.filter((x) => x.path === r.path).map((x) => [x.m, Math.round((100 * x.n) / r.views)])),
  }));
}

export type TabRow = { room: string; tab: string | null; views: number; median_s: number | null };

/** 📑 방 탭별 클릭(조회) 수와 체류 중앙값 (10/29). tab 이 null 이면 그 방의 기본 화면 */
export async function roomTabStats(fromDay: string, toDay: string, limit = 60): Promise<TabRow[]> {
  const views = await query<{ room: string; tab: string | null; views: number }>(
    `SELECT category_slug AS room, tab, count(*)::int AS views FROM page_views
      WHERE day BETWEEN $1 AND $2 AND category_slug IS NOT NULL
      GROUP BY category_slug, tab ORDER BY views DESC LIMIT $3`,
    [fromDay, toDay, limit],
  );
  if (!views.length) return [];
  const dwell = await query<{ room: string; tab: string | null; median_s: number }>(
    `SELECT category_slug AS room, tab, round((percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) / 1000)::numeric, 1)::float AS median_s
       FROM page_dwell WHERE day BETWEEN $1 AND $2 AND category_slug IS NOT NULL GROUP BY category_slug, tab`,
    [fromDay, toDay],
  );
  return views.map((v) => ({ ...v, median_s: dwell.find((d) => d.room === v.room && d.tab === v.tab)?.median_s ?? null }));
}
