/**
 * 사업 지표 집계 (Sprint 40). 정의와 기준은 src/lib/business.ts.
 * 무거운 집계(최대 16주 page_views)라 10분 동안 재사용한다 — /admin 과 주간 리포트가 같이 쓴다.
 */
import { query } from "../db";
import { config } from "../config";
import { kstDay } from "../metrics";
import {
  addDays,
  avgWeeklyGrowth,
  METRIC_DEFS,
  ratio,
  signal,
  weekStart,
  type BusinessMetrics,
  type CohortRow,
  type MetricKey,
  type RoomRow,
  type WeekRow,
} from "../business";

const KST = "Asia/Seoul";
const TTL_MS = 10 * 60_000;
const g = globalThis as unknown as { __bizMetrics?: { at: number; value: BusinessMetrics } };

/** 첫 방문 주별 코호트: 1·4·8주 뒤 그 주에 다시 온 비율. 아직 오지 않은 주는 null */
async function cohorts(currentWeek: string, weeks = 12): Promise<CohortRow[]> {
  const from = addDays(currentWeek, -7 * weeks);
  const rows = await query<{ week: string; size: number; w1: number; w4: number; w8: number }>(
    `WITH v AS (
       SELECT visitor_hash, date_trunc('week', first_seen AT TIME ZONE '${KST}')::date AS cw
         FROM visitors
        WHERE first_seen >= $1::date::timestamp AT TIME ZONE '${KST}' AND first_seen < $2::date::timestamp AT TIME ZONE '${KST}'
     ),
     a AS (SELECT DISTINCT visitor_hash, date_trunc('week', day)::date AS w FROM page_views WHERE day >= $1::date AND day < $2::date)
     SELECT v.cw::text AS week, count(DISTINCT v.visitor_hash)::int AS size,
            count(DISTINCT v.visitor_hash) FILTER (WHERE a.w = v.cw + 7)::int AS w1,
            count(DISTINCT v.visitor_hash) FILTER (WHERE a.w = v.cw + 28)::int AS w4,
            count(DISTINCT v.visitor_hash) FILTER (WHERE a.w = v.cw + 56)::int AS w8
       FROM v LEFT JOIN a ON a.visitor_hash = v.visitor_hash AND a.w IN (v.cw + 7, v.cw + 28, v.cw + 56)
      GROUP BY v.cw ORDER BY v.cw`,
    [from, currentWeek],
  );
  const done = (week: string, k: number) => addDays(week, 7 * k) < currentWeek;
  return rows.map((r) => ({
    week: r.week,
    size: r.size,
    w1: done(r.week, 1) ? r.w1 / r.size : null,
    w4: done(r.week, 4) ? r.w4 / r.size : null,
    w8: done(r.week, 8) ? r.w8 / r.size : null,
  }));
}

/** 최근 4개 완결 코호트의 4주 잔존 (코호트 크기로 가중) */
export function retention4w(rows: CohortRow[]): { value: number | null; sample: number } {
  const ready = rows.filter((r) => r.w4 !== null).slice(-4);
  const sample = ready.reduce((s, r) => s + r.size, 0);
  const kept = ready.reduce((s, r) => s + r.size * r.w4!, 0);
  return { value: ratio(kept, sample), sample };
}

async function weeksSeries(currentWeek: string, weeks = 8): Promise<WeekRow[]> {
  const from = addDays(currentWeek, -7 * weeks);
  return query<WeekRow>(
    `WITH w AS (SELECT generate_series($1::date, $2::date - 7, interval '7 days')::date AS week),
     pv AS (SELECT date_trunc('week', day)::date AS week, count(DISTINCT visitor_hash)::int AS n
              FROM page_views WHERE day >= $1::date AND day < $2::date GROUP BY 1),
     act AS (
       SELECT author_fingerprint AS fp, created_at, 'p' AS k FROM posts
        WHERE created_at >= $1::date::timestamp AT TIME ZONE '${KST}' AND created_at < $2::date::timestamp AT TIME ZONE '${KST}' AND NOT is_ai_curated
       UNION ALL
       SELECT author_fingerprint, created_at, 'c' FROM comments
        WHERE created_at >= $1::date::timestamp AT TIME ZONE '${KST}' AND created_at < $2::date::timestamp AT TIME ZONE '${KST}' AND NOT is_ai_curated
       UNION ALL
       SELECT voter_fingerprint, created_at, 'v' FROM votes
        WHERE created_at >= $1::date::timestamp AT TIME ZONE '${KST}' AND created_at < $2::date::timestamp AT TIME ZONE '${KST}'
     ),
     ac AS (SELECT date_trunc('week', created_at AT TIME ZONE '${KST}')::date AS week,
                   count(DISTINCT fp)::int AS contributors,
                   count(*) FILTER (WHERE k = 'p')::int AS posts,
                   count(*) FILTER (WHERE k = 'c')::int AS comments
              FROM act GROUP BY 1)
     SELECT w.week::text AS week, coalesce(pv.n, 0) AS visitors, coalesce(ac.contributors, 0) AS contributors,
            coalesce(ac.posts, 0) AS posts, coalesce(ac.comments, 0) AS comments
       FROM w LEFT JOIN pv ON pv.week = w.week LEFT JOIN ac ON ac.week = w.week ORDER BY w.week`,
    [from, currentWeek],
  );
}

async function stickiness(today: string): Promise<{ dau: number; mau: number }> {
  const from = addDays(today, -28);
  const to = addDays(today, -1); // 오늘은 아직 덜 찼으므로 어제까지 28일
  const rows = await query<{ total: number; mau: number }>(
    `SELECT coalesce(sum(n), 0)::int AS total,
            (SELECT count(DISTINCT visitor_hash)::int FROM page_views WHERE day BETWEEN $1::date AND $2::date) AS mau
       FROM (SELECT count(DISTINCT visitor_hash) AS n FROM page_views WHERE day BETWEEN $1::date AND $2::date GROUP BY day) d`,
    [from, to],
  );
  return { dau: rows[0]!.total / 28, mau: rows[0]!.mau };
}

async function contributors(): Promise<{ c28: number; new7: number }> {
  const rows = await query<{ c28: number; new7: number }>(
    `WITH c AS (
       SELECT author_fingerprint AS fp, created_at FROM posts WHERE created_at > now() - interval '28 days' AND NOT is_ai_curated AND author_fingerprint IS NOT NULL
       UNION ALL
       SELECT author_fingerprint, created_at FROM comments WHERE created_at > now() - interval '28 days' AND NOT is_ai_curated AND author_fingerprint IS NOT NULL
       UNION ALL
       SELECT voter_fingerprint, created_at FROM votes WHERE created_at > now() - interval '28 days'
     )
     SELECT (SELECT count(DISTINCT fp) FROM c)::int AS c28,
            (SELECT count(DISTINCT c.fp) FROM c JOIN fingerprints f ON f.fingerprint = c.fp
              WHERE c.created_at > now() - interval '7 days' AND f.first_seen > now() - interval '7 days')::int AS new7`,
  );
  return rows[0]!;
}

/** 핵심 작성자: 한 주(7일)에 서로 다른 이틀 이상 글·댓글을 쓴 사람 */
async function core(): Promise<{ thisWeek: number; fourWeeksAgo: number; prevCore: number; retained: number }> {
  const rows = await query<{ this_week: number; four_ago: number; prev_core: number; retained: number }>(
    `WITH act AS (
       SELECT author_fingerprint AS fp, created_at FROM posts WHERE created_at > now() - interval '56 days' AND NOT is_ai_curated AND author_fingerprint IS NOT NULL
       UNION ALL
       SELECT author_fingerprint, created_at FROM comments WHERE created_at > now() - interval '56 days' AND NOT is_ai_curated AND author_fingerprint IS NOT NULL
     ),
     d AS (SELECT fp, created_at, (created_at AT TIME ZONE '${KST}')::date AS day FROM act),
     prev AS (SELECT fp FROM d WHERE created_at <= now() - interval '28 days' GROUP BY fp HAVING count(DISTINCT day) >= 2)
     SELECT (SELECT count(*) FROM (SELECT fp FROM d WHERE created_at > now() - interval '7 days' GROUP BY fp HAVING count(DISTINCT day) >= 2) x)::int AS this_week,
            (SELECT count(*) FROM (SELECT fp FROM d WHERE created_at > now() - interval '35 days' AND created_at <= now() - interval '28 days'
                                    GROUP BY fp HAVING count(DISTINCT day) >= 2) x)::int AS four_ago,
            (SELECT count(*) FROM prev)::int AS prev_core,
            (SELECT count(*) FROM prev WHERE EXISTS (SELECT 1 FROM d WHERE d.fp = prev.fp AND d.created_at > now() - interval '28 days'))::int AS retained`,
  );
  const r = rows[0]!;
  return { thisWeek: r.this_week, fourWeeksAgo: r.four_ago, prevCore: r.prev_core, retained: r.retained };
}

async function responsiveness(): Promise<{ total: number; answered: number }> {
  const rows = await query<{ total: number; answered: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM comments c
               WHERE c.post_id = p.id AND NOT c.is_ai_curated AND c.created_at <= p.created_at + interval '24 hours'
                 AND c.author_fingerprint IS DISTINCT FROM p.author_fingerprint))::int AS answered
       FROM posts p
      WHERE p.created_at > now() - interval '8 days' AND p.created_at <= now() - interval '24 hours' AND NOT p.is_ai_curated`,
  );
  return rows[0]!;
}

async function rooms(): Promise<RoomRow[]> {
  return query<RoomRow>(
    `WITH a AS (
       SELECT category_id, author_fingerprint AS fp, created_at, 'p' AS k FROM posts
        WHERE created_at > now() - interval '14 days' AND NOT is_ai_curated
       UNION ALL
       SELECT p.category_id, c.author_fingerprint, c.created_at, 'c' FROM comments c JOIN posts p ON p.id = c.post_id
        WHERE c.created_at > now() - interval '14 days' AND NOT c.is_ai_curated
     )
     SELECT cat.slug, cat.name,
            count(DISTINCT a.fp) FILTER (WHERE a.created_at > now() - interval '7 days')::int AS "authors7d",
            count(DISTINCT a.fp) FILTER (WHERE a.created_at <= now() - interval '7 days')::int AS "authorsPrev7d",
            count(*) FILTER (WHERE a.k = 'p' AND a.created_at > now() - interval '7 days')::int AS "posts7d",
            count(*) FILTER (WHERE a.k = 'c' AND a.created_at > now() - interval '7 days')::int AS "comments7d"
       FROM categories cat LEFT JOIN a ON a.category_id = cat.id
      GROUP BY cat.id ORDER BY 3 DESC, cat.sort_order, cat.id`,
  );
}

async function roomRequests(): Promise<{ open: number; agreements7d: number }> {
  const rows = await query<{ open: number; agreements7d: number }>(
    `SELECT (SELECT count(*) FROM board_requests WHERE status = 'open')::int AS open,
            (SELECT count(*) FROM board_request_votes WHERE created_at > now() - interval '7 days')::int AS "agreements7d"`,
  );
  return rows[0]!;
}

async function sources(today: string): Promise<{ source: string; landings: number }[]> {
  return query(
    `SELECT source, count(*)::int AS landings FROM page_views
      WHERE is_landing AND source <> 'internal' AND day >= $1::date GROUP BY source ORDER BY 2 DESC`,
    [addDays(today, -27)],
  );
}

async function survey(): Promise<BusinessMetrics["survey"]> {
  const [c, comments] = await Promise.all([
    query<{ total: number; very: number; somewhat: number; not: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE answer = 1)::int AS very,
              count(*) FILTER (WHERE answer = 2)::int AS somewhat, count(*) FILTER (WHERE answer = 3)::int AS "not"
         FROM pmf_survey WHERE created_at > now() - interval '90 days'`,
    ),
    query<{ answer: number; comment: string; at: string }>(
      `SELECT answer, comment, created_at AS at FROM pmf_survey WHERE comment IS NOT NULL ORDER BY created_at DESC LIMIT 20`,
    ),
  ]);
  return { ...c[0]!, comments };
}

/**
 * 10분 안의 값은 그대로, 그보다 오래됐으면 지난 값을 바로 돌려주고 뒤에서 새로 센다 (/admin 이 기다리지 않게).
 * 글 20만·추천 350만·월 방문자 5만 규모에서 새로 세는 데 2.5초(캐시가 찬 DB) ~ 12초(차가운 DB) — Sprint 40 측정.
 */
export async function getBusinessMetrics(opts: { fresh?: boolean; now?: Date } = {}): Promise<BusinessMetrics> {
  const cached = g.__bizMetrics;
  if (!opts.fresh && cached) {
    if (Date.now() - cached.at >= TTL_MS && !refreshing) {
      refreshing = computeBusinessMetrics()
        .catch((e) => console.error("[business] 지표 갱신 실패:", (e as Error).message))
        .finally(() => {
          refreshing = null;
        });
    }
    return cached.value;
  }
  return computeBusinessMetrics(opts.now);
}

let refreshing: Promise<unknown> | null = null;

async function computeBusinessMetrics(nowArg?: Date): Promise<BusinessMetrics> {
  const now = nowArg ?? new Date();
  const today = kstDay(now);
  const currentWeek = weekStart(today);
  const [co, wk, st, ct, cr, rs, rm, rr, src, sv] = await Promise.all([
    cohorts(currentWeek),
    weeksSeries(currentWeek),
    stickiness(today),
    contributors(),
    core(),
    responsiveness(),
    rooms(),
    roomRequests(),
    sources(today),
    survey(),
  ]);

  const ret = retention4w(co);
  const external = src.reduce((s, r) => s + r.landings, 0);
  const wom = src.filter((r) => r.source !== "search").reduce((s, r) => s + r.landings, 0);
  const last5 = wk.slice(-5).map((w) => w.visitors);
  const alive = rm.filter((r) => r.authors7d >= 3).length;

  const raw: Record<MetricKey, { value: number | null; sample: number }> = {
    retention: ret,
    stickiness: { value: ratio(st.dau, st.mau), sample: st.mau },
    pmf: { value: ratio(sv.very, sv.total), sample: sv.total },
    participation: { value: ratio(ct.c28, st.mau), sample: st.mau },
    aliveRooms: { value: ratio(alive, rm.length), sample: rm.length },
    coreRetention: { value: ratio(cr.retained, cr.prevCore), sample: cr.prevCore },
    responsiveness: { value: ratio(rs.answered, rs.total), sample: rs.total },
    growth: { value: avgWeeklyGrowth(last5), sample: last5[last5.length - 1] ?? 0 },
    wordOfMouth: { value: ratio(wom, external), sample: external },
  };
  const values = Object.fromEntries(
    (Object.keys(raw) as MetricKey[]).map((k) => {
      const d = METRIC_DEFS[k];
      return [k, { ...raw[k], signal: signal(raw[k].value, d.green, d.yellow, raw[k].sample, d.minSample) }];
    }),
  ) as BusinessMetrics["values"];

  const monthly = config.monthlyCostUsd;
  const value: BusinessMetrics = {
    generatedAt: now.toISOString(),
    values,
    cohorts: co,
    weeks: wk,
    rooms: rm,
    visitors28d: st.mau,
    contributors28d: ct.c28,
    newContributors7d: ct.new7,
    coreThisWeek: cr.thisWeek,
    coreFourWeeksAgo: cr.fourWeeksAgo,
    roomRequests: rr,
    sources28d: src,
    survey: sv,
    cost: { monthlyUsd: monthly, mau: st.mau, perMauUsd: ratio(monthly, st.mau), perContributorUsd: ratio(monthly, ct.c28) },
  };
  g.__bizMetrics = { at: Date.now(), value };
  return value;
}

export function resetBusinessMetricsCache() {
  delete g.__bizMetrics;
}

export type BizReport = { week_start: string; created_at: string; sent_via: string | null; error: string | null; subject: string; text: string };

export async function listBizReports(limit = 8): Promise<BizReport[]> {
  return query<BizReport>(
    `SELECT week_start::text, created_at, sent_via, error, body->>'subject' AS subject, body->>'text' AS text
       FROM biz_reports ORDER BY week_start DESC LIMIT $1`,
    [limit],
  );
}
