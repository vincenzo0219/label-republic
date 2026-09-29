/**
 * 첫 방문·빈 보드 온보딩에 쓰는 조회 (Sprint 32).
 */
import { query } from "../db";
import { THIN_BOARD_POSTS } from "../onboarding";
import { listRenewals, type RenewalItem } from "./renewal-feed";

const VISIBLE = "NOT p.is_blinded AND NOT p.is_suppressed";

export type LonelyProduct = { id: string; brand: string; name: string };
export type BoardNeeds = {
  /** 보이는 정보 글 수 (잡담·정모 제외) */
  infoPosts: number;
  /** 리뉴얼로 보이지만 제보가 더 필요한 제품 */
  pending: RenewalItem[];
  /** 글이 하나뿐인 제품 — 같은 제품 라벨을 한 번 더 올리면 교차 확인이 된다 */
  lonely: LonelyProduct[];
};

/**
 * 글이 적은 보드의 안내에 쓸 것. 모든 보드 첫 화면에서 불리므로 먼저 정보 글이 THIN 개 이상인지만 세고(최대 THIN 행만 읽음),
 * 적을 때만 나머지를 조회한다 (Sprint 33: 글 많은 보드에서 제품 전체를 훑던 문제).
 */
export async function boardNeeds(categoryId: number, limit = 5): Promise<BoardNeeds> {
  const count = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM (
       SELECT 1 FROM posts p WHERE p.category_id = $1 AND p.post_type = 'info' AND ${VISIBLE} LIMIT $2
     ) x`,
    [categoryId, THIN_BOARD_POSTS],
  );
  const infoPosts = count[0]?.n ?? 0;
  if (infoPosts >= THIN_BOARD_POSTS) return { infoPosts, pending: [], lonely: [] };
  const [pending, lonely] = await Promise.all([
    listRenewals({ status: "pending", categoryId, pageSize: limit }),
    // 최근 정보 글(올린 지 1시간이 지난 것 — 자동 검사가 끝난 뒤) 200개의 제품 중 보이는 글이 하나뿐인 것.
    // 방금 올린 글의 제품 이름이 곧바로 보드 안내 맨 위에 걸리지 않게, 잡담·정모에만 붙은 제품은 빼고
    query<LonelyProduct>(
      `WITH recent AS MATERIALIZED (
         SELECT p.id, p.created_at FROM posts p
          WHERE p.category_id = $1 AND p.post_type = 'info' AND ${VISIBLE} AND p.created_at < now() - interval '1 hour'
          ORDER BY p.created_at DESC LIMIT 200
       )
       SELECT id, brand, name FROM (
         SELECT DISTINCT ON (pr.id) pr.id::text, pr.brand, pr.name, r.created_at
           FROM recent r JOIN post_products pp ON pp.post_id = r.id JOIN products pr ON pr.id = pp.product_id
          WHERE pr.merged_into IS NULL
            AND (SELECT count(*) FROM post_products pp2 JOIN posts p ON p.id = pp2.post_id WHERE pp2.product_id = pr.id AND ${VISIBLE}) = 1
          ORDER BY pr.id, r.created_at DESC
       ) x ORDER BY created_at DESC, id DESC LIMIT $2`,
      [categoryId, limit],
    ),
  ]);
  return { infoPosts, pending: pending.items, lonely };
}

export type SiteStats = { posts: number; products: number; boards: number };

const STATS_TTL_MS = 5 * 60_000;
const g = globalThis as unknown as { __lrSiteStats?: { at: number; value: Promise<SiteStats> } };

/**
 * 첫 방문 안내의 한 줄 요약. 쿠키 없는 요청(첫 방문자·검색 로봇·감시 요청)마다 불리므로 5분 동안 재사용한다
 * (Sprint 33: 요청마다 전체 글·제품을 세던 문제). 모두에게 같은 대략의 공개 숫자라 캐시해도 된다.
 */
export function siteStats(now = Date.now()): Promise<SiteStats> {
  const c = g.__lrSiteStats;
  if (c && now - c.at < STATS_TTL_MS) return c.value;
  const value = query<SiteStats>(
    `SELECT (SELECT count(*)::int FROM posts p WHERE ${VISIBLE}) AS posts,
            (SELECT count(*)::int FROM products pr WHERE pr.merged_into IS NULL
               AND EXISTS (SELECT 1 FROM post_products pp JOIN posts p ON p.id = pp.post_id WHERE pp.product_id = pr.id AND ${VISIBLE})) AS products,
            (SELECT count(*)::int FROM categories) AS boards`,
  ).then((rows) => rows[0]!);
  g.__lrSiteStats = { at: now, value };
  // 실패하면 다음 요청이 다시 세도록
  value.catch(() => {
    if (g.__lrSiteStats?.value === value) g.__lrSiteStats = undefined;
  });
  return value;
}

/** 테스트용 */
export function resetSiteStatsCache() {
  g.__lrSiteStats = undefined;
}
