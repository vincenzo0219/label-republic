/**
 * 운영 대시보드 쿼리. 날짜는 모두 Asia/Seoul 기준(page_views.day).
 * 지표 우선순위(기획안): 검색 유입 → 게시글 조회 → 댓글/투표 참여 → 재방문
 */
import { query } from "../db";
import { config } from "../config";
import { curatorIntervalHours } from "../curator";
import { kstDay } from "../metrics";

export type DailyRow = {
  day: string;
  page_views: number;
  search_landings: number;
  visitors: number;
  returning_visitors: number;
  human_posts: number;
  comments: number;
  votes: number;
};

const KST = "Asia/Seoul";

// 지난 날짜의 일별 집계는 바뀌지 않으므로 프로세스 메모리에 보관하고, 오늘과 아직 없는 날짜만 다시 센다.
// (투표·댓글·조회가 많으면 90일 집계 한 번에 수 초가 걸린다)
const g = globalThis as unknown as { __labelRepDailyCache?: Map<string, DailyRow> };
const dailyCache = (g.__labelRepDailyCache ??= new Map<string, DailyRow>());

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function dailySeries(days = 30, now = new Date()): Promise<DailyRow[]> {
  const today = kstDay(now);
  const wanted = Array.from({ length: days }, (_, i) => shiftDay(today, i - days + 1));
  const firstMissing = wanted.find((d) => d !== today && !dailyCache.has(d));
  // 비어 있는 가장 이른 날부터 오늘까지 한 번에 센다 (보통은 오늘 하루)
  const span = firstMissing ? wanted.length - wanted.indexOf(firstMissing) : 1;
  const fresh = await dailyRows(today, span);
  for (const r of fresh) if (r.day !== today) dailyCache.set(r.day, r);
  if (dailyCache.size > 400) {
    for (const k of [...dailyCache.keys()].sort().slice(0, dailyCache.size - 400)) dailyCache.delete(k);
  }
  const byDay = new Map(fresh.map((r) => [r.day, r]));
  return wanted.map((d) => byDay.get(d) ?? dailyCache.get(d)!);
}

/** 테스트용: 일별 집계 캐시 비우기 */
export function clearDailyCache() {
  dailyCache.clear();
}

async function dailyRows(today: string, days: number): Promise<DailyRow[]> {
  return query<DailyRow>(
    `WITH d AS (SELECT generate_series($1::date - ($2::int - 1), $1::date, interval '1 day')::date AS day),
     pv AS (
       SELECT day, count(*)::int AS page_views,
              count(*) FILTER (WHERE source = 'search' AND is_landing)::int AS search_landings,
              count(DISTINCT visitor_hash)::int AS visitors,
              count(DISTINCT visitor_hash) FILTER (WHERE is_returning)::int AS returning_visitors
         FROM page_views WHERE day > $1::date - $2::int GROUP BY day
     ),
     po AS (SELECT (created_at AT TIME ZONE '${KST}')::date AS day, count(*)::int AS n FROM posts
             WHERE NOT is_ai_curated AND created_at > now() - make_interval(days => $2::int + 1) GROUP BY 1),
     co AS (SELECT (created_at AT TIME ZONE '${KST}')::date AS day, count(*)::int AS n FROM comments
             WHERE NOT is_ai_curated AND created_at > now() - make_interval(days => $2::int + 1) GROUP BY 1),
     vo AS (SELECT (created_at AT TIME ZONE '${KST}')::date AS day, count(*)::int AS n FROM votes
             WHERE created_at > now() - make_interval(days => $2::int + 1) GROUP BY 1)
     SELECT d.day::text AS day,
            coalesce(pv.page_views, 0) AS page_views,
            coalesce(pv.search_landings, 0) AS search_landings,
            coalesce(pv.visitors, 0) AS visitors,
            coalesce(pv.returning_visitors, 0) AS returning_visitors,
            coalesce(po.n, 0) AS human_posts,
            coalesce(co.n, 0) AS comments,
            coalesce(vo.n, 0) AS votes
       FROM d
       LEFT JOIN pv ON pv.day = d.day
       LEFT JOIN po ON po.day = d.day
       LEFT JOIN co ON co.day = d.day
       LEFT JOIN vo ON vo.day = d.day
      ORDER BY d.day`,
    [today, days],
  );
}

export type PeriodVisitors = { visitors: number; returning: number };

/** 기간 내 고유 방문자와, 그중 이전 날짜에도 방문한 적이 있는 재방문자 (일별 합이 아닌 기간 전체 distinct) */
export async function periodVisitors(fromDay: string, toDay: string): Promise<PeriodVisitors> {
  const rows = await query<PeriodVisitors>(
    `SELECT count(DISTINCT visitor_hash)::int AS visitors,
            count(DISTINCT visitor_hash) FILTER (WHERE is_returning)::int AS returning
       FROM page_views WHERE day BETWEEN $1::date AND $2::date`,
    [fromDay, toDay],
  );
  return rows[0]!;
}

export type SourceRow = { source: string; landings: number };

export async function sourceBreakdown(fromDay: string, toDay: string): Promise<SourceRow[]> {
  return query<SourceRow>(
    `SELECT source, count(*)::int AS landings FROM page_views
      WHERE is_landing AND day BETWEEN $1::date AND $2::date GROUP BY source ORDER BY landings DESC`,
    [fromDay, toDay],
  );
}

export async function topReferrers(fromDay: string, toDay: string, source: string, limit = 8): Promise<{ host: string; landings: number }[]> {
  return query(
    `SELECT referrer_host AS host, count(*)::int AS landings FROM page_views
      WHERE is_landing AND source = $3 AND referrer_host IS NOT NULL AND day BETWEEN $1::date AND $2::date
      GROUP BY referrer_host ORDER BY landings DESC LIMIT $4`,
    [fromDay, toDay, source, limit],
  );
}

export type TopPost = { id: string; title: string; category: string; is_ai_curated: boolean; n: number };

/** 검색으로 들어온 첫 페이지(랜딩) 기준 상위 게시글 — SEO가 실제로 끌어오는 글 */
export async function topSearchLandingPosts(fromDay: string, toDay: string, limit = 10): Promise<TopPost[]> {
  return query<TopPost>(
    `SELECT p.id, p.title, c.name AS category, p.is_ai_curated, count(*)::int AS n
       FROM page_views v JOIN posts p ON p.id = v.post_id JOIN categories c ON c.id = p.category_id
      WHERE v.is_landing AND v.source = 'search' AND v.day BETWEEN $1::date AND $2::date
      GROUP BY p.id, c.name ORDER BY n DESC LIMIT $3`,
    [fromDay, toDay, limit],
  );
}

export async function topViewedPosts(fromDay: string, toDay: string, limit = 10): Promise<TopPost[]> {
  return query<TopPost>(
    `SELECT p.id, p.title, c.name AS category, p.is_ai_curated, count(*)::int AS n
       FROM page_views v JOIN posts p ON p.id = v.post_id JOIN categories c ON c.id = p.category_id
      WHERE v.day BETWEEN $1::date AND $2::date
      GROUP BY p.id, c.name ORDER BY n DESC LIMIT $3`,
    [fromDay, toDay, limit],
  );
}

/** 사이트 내 검색어 상위 — 콘텐츠 수요(아직 글이 없는 주제) 파악용 */
export async function topInternalSearches(fromDay: string, toDay: string, limit = 10): Promise<{ q: string; n: number }[]> {
  return query(
    `SELECT lower(search_query) AS q, count(*)::int AS n FROM page_views
      WHERE search_query IS NOT NULL AND day BETWEEN $1::date AND $2::date
      GROUP BY lower(search_query) ORDER BY n DESC LIMIT $3`,
    [fromDay, toDay, limit],
  );
}

export type BoardRow = {
  slug: string;
  name: string;
  human_posts_7d: number;
  ai_posts_7d: number;
  comments_7d: number;
  views_7d: number;
  queued: number;
  curator_interval_hours: number | null;
  auto_promoted: boolean;
};

export async function boardStats(): Promise<BoardRow[]> {
  // 방별 상관 서브쿼리(방 수 × 전체 스캔) 대신 최근 7일 범위를 한 번씩만 집계해 붙인다
  const rows = await query<Omit<BoardRow, "curator_interval_hours">>(
    `WITH p7 AS (
       SELECT category_id,
              count(*) FILTER (WHERE NOT is_ai_curated AND post_type = 'info')::int AS human_posts_7d,
              count(*) FILTER (WHERE is_ai_curated)::int AS ai_posts_7d
         FROM posts WHERE created_at > now() - interval '7 days' GROUP BY category_id
     ),
     c7 AS (
       SELECT p.category_id, count(*)::int AS n FROM comments m JOIN posts p ON p.id = m.post_id
        WHERE NOT m.is_ai_curated AND m.created_at > now() - interval '7 days' GROUP BY p.category_id
     ),
     v7 AS (
       SELECT p.category_id, count(*)::int AS n FROM page_views v JOIN posts p ON p.id = v.post_id
        WHERE v.post_id IS NOT NULL AND v.day >= (now() AT TIME ZONE '${KST}')::date - 8 AND v.occurred_at > now() - interval '7 days'
        GROUP BY p.category_id
     ),
     q AS (SELECT category_id, count(*)::int AS n FROM curator_queue WHERE status = 'queued' GROUP BY category_id)
     SELECT c.slug, c.name, c.auto_promoted_at IS NOT NULL AS auto_promoted,
            coalesce(p7.human_posts_7d, 0) AS human_posts_7d, coalesce(p7.ai_posts_7d, 0) AS ai_posts_7d,
            coalesce(c7.n, 0) AS comments_7d, coalesce(v7.n, 0) AS views_7d, coalesce(q.n, 0) AS queued
       FROM categories c
       LEFT JOIN p7 ON p7.category_id = c.id
       LEFT JOIN c7 ON c7.category_id = c.id
       LEFT JOIN v7 ON v7.category_id = c.id
       LEFT JOIN q ON q.category_id = c.id
      ORDER BY c.sort_order, c.id`,
  );
  return rows.map((r) => ({ ...r, curator_interval_hours: curatorIntervalHours({ humanPosts7d: r.human_posts_7d, aiPosts7d: r.ai_posts_7d }) }));
}

export type AlertRow = {
  id: string;
  kind: string;
  subject_type: string;
  subject_id: string;
  severity: "warning" | "serious";
  detail: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
  hits: number;
};

export async function recentAlerts(limit = 50): Promise<AlertRow[]> {
  return query<AlertRow>(`SELECT * FROM abuse_alerts ORDER BY last_seen DESC LIMIT $1`, [limit]);
}

export type ModerationRow = { id: string; title: string; category: string; report_count: number; report_score: number; blinded_at: string };

export async function recentBlinds(limit = 20): Promise<ModerationRow[]> {
  return query<ModerationRow>(
    `SELECT p.id, p.title, c.name AS category, p.report_count, p.report_score, p.blinded_at
       FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE p.is_blinded AND p.blinded_at > now() - interval '7 days'
      ORDER BY p.blinded_at DESC LIMIT $1`,
    [limit],
  );
}

export async function moderationCounts(): Promise<{ blinded_7d: number; suppressed: number; reports_7d: number; downweighted_7d: number }> {
  const rows = await query<{ blinded_7d: number; suppressed: number; reports_7d: number; downweighted_7d: number }>(
    `SELECT (SELECT count(*)::int FROM posts WHERE is_blinded AND blinded_at > now() - interval '7 days') AS blinded_7d,
            (SELECT count(*)::int FROM posts WHERE is_suppressed AND NOT is_blinded) AS suppressed,
            (SELECT count(*)::int FROM reports WHERE created_at > now() - interval '7 days') AS reports_7d,
            (SELECT count(*)::int FROM reports WHERE weight < 1 AND created_at > now() - interval '7 days') AS downweighted_7d`,
  );
  return rows[0]!;
}

export type JobHealth = { job: string; started_at: string | null; finished_at: string | null; error: string | null; detail: string | null };

export async function jobHealth(): Promise<JobHealth[]> {
  return query<JobHealth>(
    `SELECT 'trust' AS job, started_at, finished_at, error, changed::text AS detail FROM (SELECT * FROM trust_batch_runs ORDER BY id DESC LIMIT 1) t
     UNION ALL
     SELECT 'curator', started_at, finished_at, error, published::text FROM (SELECT * FROM curator_runs ORDER BY id DESC LIMIT 1) c
     UNION ALL
     SELECT 'maintenance', started_at, finished_at, error, (detail->>'alerts') FROM (SELECT * FROM maintenance_runs ORDER BY id DESC LIMIT 1) m
     UNION ALL
     SELECT 'sources', started_at, finished_at, error, checked::text || '/' || broken::text FROM (SELECT * FROM source_check_runs ORDER BY id DESC LIMIT 1) s
     UNION ALL
     SELECT 'push', started_at, finished_at, error, sent::text || '/' || checked::text FROM (SELECT * FROM push_runs ORDER BY id DESC LIMIT 1) u`,
  );
}

export type OpenBoardRequest = { id: string; requested_name: string; vote_count: number; created_at: string; promotable_at: string };

export async function openBoardRequests(): Promise<OpenBoardRequest[]> {
  return query<OpenBoardRequest>(
    `SELECT id, requested_name, vote_count, created_at,
            (created_at + make_interval(hours => $1::int))::text AS promotable_at
       FROM board_requests WHERE status = 'open' ORDER BY vote_count DESC, id LIMIT 20`,
    [config.boardPromotionMinAgeHours],
  );
}

export type ErrorEventRow = {
  id: string;
  kind: "api" | "page" | "job" | "process" | "client";
  message: string;
  path: string;
  stack: string;
  count: number;
  hour_count: number;
  first_seen: string;
  last_seen: string;
};

/** 운영 대시보드: 해결 표시하지 않은 서버 오류 (최근 발생 순) */
export async function openErrors(limit = 20): Promise<ErrorEventRow[]> {
  return query<ErrorEventRow>(
    `SELECT id, kind, message, path, left(stack, 1500) AS stack, count,
            CASE WHEN hour_start > now() - interval '1 hour' THEN hour_count ELSE 0 END AS hour_count, first_seen, last_seen
       FROM error_events WHERE resolved_at IS NULL ORDER BY last_seen DESC LIMIT $1`,
    [limit],
  );
}

/** 해결 표시 — 같은 오류가 다시 나면 자동으로 다시 열리고 알림이 간다 */
export async function resolveError(id: string): Promise<void> {
  if (!/^\d{1,18}$/.test(id)) return;
  await query("UPDATE error_events SET resolved_at = now() WHERE id = $1", [id]);
}

export type UserStateDay = { day: string; active: number; new_users: number; current: number; reactivated: number; yesterday: number; at_risk: number; curr: number | null };

/**
 * 듀오링고식 사용자 상태 (Sprint 80). 그날 방문자를 새 사용자(첫 방문일) · 현재 사용자(전날도 옴) · 돌아온 사용자(나머지)로 나누고,
 * 전날 왔는데 그날 안 온 사람을 위험 사용자로 센다. CURR = 현재 사용자 ÷ 전날 방문자 — 메인 지표.
 */
export async function userStates(today: string, days = 7): Promise<UserStateDay[]> {
  const rows = await query<Omit<UserStateDay, "reactivated" | "curr">>(
    `WITH act AS (SELECT DISTINCT day, visitor_hash FROM page_views WHERE day >= $1::date - ($2::int + 1) AND day <= $1::date),
          ds AS (SELECT generate_series($1::date - ($2::int - 1), $1::date, interval '1 day')::date AS t)
     SELECT to_char(ds.t, 'YYYY-MM-DD') AS day,
            (SELECT count(*)::int FROM act a WHERE a.day = ds.t) AS active,
            (SELECT count(*)::int FROM act a JOIN visitors v USING (visitor_hash)
              WHERE a.day = ds.t AND (v.first_seen AT TIME ZONE 'Asia/Seoul')::date >= ds.t) AS new_users,
            (SELECT count(*)::int FROM act a WHERE a.day = ds.t AND EXISTS (SELECT 1 FROM act b WHERE b.visitor_hash = a.visitor_hash AND b.day = ds.t - 1)) AS current,
            (SELECT count(*)::int FROM act a WHERE a.day = ds.t - 1) AS yesterday,
            (SELECT count(*)::int FROM act a WHERE a.day = ds.t - 1 AND NOT EXISTS (SELECT 1 FROM act b WHERE b.visitor_hash = a.visitor_hash AND b.day = ds.t)) AS at_risk
       FROM ds ORDER BY ds.t DESC`,
    [today, days],
  );
  return rows.map((r) => ({
    ...r,
    reactivated: Math.max(0, r.active - r.new_users - r.current),
    curr: r.yesterday ? Math.round((r.current / r.yesterday) * 1000) / 10 : null,
  }));
}

/** 운영 닉네임 — 사람끼리 반응을 셀 때 뺀다 (Sprint 87) */
export const OPERATOR_NICKS = ["노방장", "돈키호테", "덕후1호", "💬 수다방"];

export type PeopleDay = {
  day: string;
  /** 사람이 쓴 댓글·수다방 말 */
  human: number;
  /** 사람 → 다른 사람 반응: 사람 댓글에 단 답글, 사람 글에 단 댓글, 수다방에서 30분 안에 다른 사람 말에 이어 말한 것 */
  h2h: number;
  /** 그날 사람 댓글 중 나중에 다른 사람이 답한 비율 (%) */
  answered: number | null;
  /** 사람 댓글에 사람이 누른 👍 */
  likes: number;
  /** 운영·AI가 쓴 댓글·글 */
  ops: number;
};

/**
 * 🤝 사람끼리 반응 (Sprint 87, 사용자 10/19 "바로 이거야"). AI 는 사회자, 주인공은 사람 — AI 글 수가 아니라
 * 사람이 사람에게 반응한 수가 커뮤니티의 북극성 지표다.
 */
export async function peopleReactions(today: string, days = 7): Promise<PeopleDay[]> {
  return query<PeopleDay>(
    `WITH ds AS (SELECT generate_series($1::date - ($2::int - 1), $1::date, interval '1 day')::date AS t),
          c AS (SELECT c.id, c.post_id, c.parent_id, c.author_fingerprint AS fp, c.created_at,
                       (c.created_at AT TIME ZONE 'Asia/Seoul')::date AS day,
                       (NOT c.is_ai_curated AND c.author_fingerprint IS NOT NULL AND c.nickname <> ALL($3::text[])) AS human
                  FROM comments c WHERE c.created_at >= ($1::date - $2::int) AT TIME ZONE 'Asia/Seoul' AND c.ai_hidden_at IS NULL),
          p AS (SELECT p.id, p.author_fingerprint AS fp, p.seed_key,
                       (NOT p.is_ai_curated AND p.author_fingerprint IS NOT NULL AND p.nickname <> ALL($3::text[])) AS human
                  FROM posts p WHERE p.id IN (SELECT post_id FROM c)),
          hc AS (SELECT c.*,
                   (EXISTS (SELECT 1 FROM comments pc WHERE pc.id = c.parent_id AND NOT pc.is_ai_curated AND pc.author_fingerprint IS NOT NULL
                              AND pc.author_fingerprint <> c.fp AND pc.nickname <> ALL($3::text[]))
                    OR (c.parent_id IS NULL AND p.human AND p.fp <> c.fp)
                    OR (p.seed_key LIKE 'roomchat:%' AND EXISTS (SELECT 1 FROM c o WHERE o.post_id = c.post_id AND o.human AND o.fp <> c.fp
                              AND o.created_at < c.created_at AND o.created_at > c.created_at - interval '30 minutes'))) AS to_human,
                   EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id AND NOT r.is_ai_curated AND r.author_fingerprint IS NOT NULL
                              AND r.author_fingerprint <> c.fp AND r.nickname <> ALL($3::text[])) AS got_reply
                   FROM c JOIN p ON p.id = c.post_id WHERE c.human)
     SELECT to_char(ds.t, 'YYYY-MM-DD') AS day,
            (SELECT count(*)::int FROM hc WHERE hc.day = ds.t) AS human,
            (SELECT count(*)::int FROM hc WHERE hc.day = ds.t AND hc.to_human) AS h2h,
            (SELECT round(100.0 * count(*) FILTER (WHERE got_reply) / nullif(count(*), 0), 1)::float FROM hc WHERE hc.day = ds.t) AS answered,
            (SELECT count(*)::int FROM comment_likes l JOIN hc ON hc.id = l.comment_id
              WHERE l.by_name IS NULL AND (l.created_at AT TIME ZONE 'Asia/Seoul')::date = ds.t) AS likes,
            (SELECT count(*)::int FROM c WHERE c.day = ds.t AND NOT c.human)
              + (SELECT count(*)::int FROM posts op WHERE (op.created_at AT TIME ZONE 'Asia/Seoul')::date = ds.t
                   AND (op.is_ai_curated OR op.author_fingerprint IS NULL OR op.nickname = ANY($3::text[]))) AS ops
       FROM ds ORDER BY ds.t DESC`,
    [today, days, OPERATOR_NICKS],
  );
}

/** 지금까지 이 방(방 화면 + 방 글)을 본 고유 방문자 수 — 방 머리의 "👥 n" (카톡 오픈채팅 인원처럼 숫자만) */
export async function roomVisitorsTotal(slug: string): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT count(DISTINCT pv.visitor_hash)::int AS n
       FROM page_views pv
       LEFT JOIN posts p ON p.id = pv.post_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE pv.category_slug = $1 OR c.slug = $1`,
    [slug],
  );
  return rows[0]?.n ?? 0;
}
