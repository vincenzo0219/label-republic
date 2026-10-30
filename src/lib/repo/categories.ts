import { appHiddenSlugs } from "../appMode";
import { query } from "../db";
import type { Category } from "../types";

const COLS = "id, name, slug, description, post_count, auto_promoted_at, info_only, no_matching, is_hidden";

/** 숨긴 방(Sprint 81)은 빼고. all 이면 숨긴 방도 (사이트맵·팩트 검색처럼 글 주소가 필요한 곳) */
export async function listCategories(opts: { all?: boolean } = {}): Promise<Category[]> {
  const rows = await query<Category>(`SELECT ${COLS} FROM categories ${opts.all ? "" : "WHERE NOT is_hidden "}ORDER BY sort_order, id`);
  // 스토어 앱 안에서는 19+ 방을 뺀다 (appMode)
  const hide = opts.all ? [] : await appHiddenSlugs();
  return hide.length ? rows.filter((r) => !hide.includes(r.slug)) : rows;
}

/** 사람(🤖 아닌) 글·댓글이 이 기간 동안 없으면 "조용한 방" — 홈 탭·첫 방문 안내에서 뒤로 보낸다 */
export const QUIET_ROOM_DAYS = 14;

/**
 * 조용한 방의 slug. 투표로 막 열린 방(7일 이내)은 사람을 기다리는 중이라 빼 준다.
 * 방이 몇 개 안 되고 방마다 EXISTS 두 번이라 가볍다.
 */
export async function quietRoomSlugs(): Promise<Set<string>> {
  const rows = await query<{ slug: string; quiet: boolean }>(
    `SELECT c.slug,
            (c.auto_promoted_at IS NULL OR c.auto_promoted_at < now() - interval '7 days')
            AND NOT EXISTS (SELECT 1 FROM posts p
                             WHERE p.category_id = c.id AND NOT p.is_ai_curated AND NOT p.is_blinded
                               AND p.created_at > now() - make_interval(days => $1))
            AND NOT EXISTS (SELECT 1 FROM comments m JOIN posts p ON p.id = m.post_id
                             WHERE p.category_id = c.id AND NOT m.is_ai_curated
                               AND m.created_at > now() - make_interval(days => $1)) AS quiet
       FROM categories c WHERE NOT c.is_hidden`,
    [QUIET_ROOM_DAYS],
  );
  const quiet = rows.filter((r) => r.quiet).map((r) => r.slug);
  // 전부 조용하면 (갓 연 사이트) 가릴 근거가 없다
  return new Set(quiet.length === rows.length ? [] : quiet);
}

/** 이야기가 오가는 방을 앞에, 조용한 방을 뒤에 (각각 원래 순서 유지) */
export function activeRoomsFirst<T extends { slug: string }>(rooms: T[], quiet: Set<string>): T[] {
  return [...rooms.filter((r) => !quiet.has(r.slug)), ...rooms.filter((r) => quiet.has(r.slug))];
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  if ((await appHiddenSlugs()).includes(slug)) return null;
  const rows = await query<Category>(`SELECT ${COLS} FROM categories WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

/**
 * 🏠 홈 방 고르기 (10/30 대표님 "첫 화면은 방 고르기"): 방마다 최근 24시간 사람(🤖 아닌) 글·댓글 수.
 * 방 카드 아래 "오늘 이야기 n"과 순서(많은 방 먼저)에 쓴다. 방이 몇 개 안 돼 가볍다
 */
export async function roomActivity(): Promise<Record<string, number>> {
  const rows = await query<{ slug: string; n: number }>(
    `SELECT c.slug,
            (SELECT count(*)::int FROM posts p
              WHERE p.category_id = c.id AND NOT p.is_ai_curated AND NOT p.is_blinded
                AND p.created_at > now() - interval '24 hours')
          + (SELECT count(*)::int FROM comments m JOIN posts p ON p.id = m.post_id
              WHERE p.category_id = c.id AND NOT m.is_ai_curated AND m.ai_hidden_at IS NULL
                AND m.created_at > now() - interval '24 hours') AS n
       FROM categories c WHERE NOT c.is_hidden`,
  );
  return Object.fromEntries(rows.filter((r) => r.n > 0).map((r) => [r.slug, r.n]));
}

/** 방별로 since 이후 올라온 (보이는) 글 수 — 방 탭 "새 글 N" (Sprint 41). 방당 100에서 멈춘다 */
export async function newPostCounts(pairs: { slug: string; since: Date }[]): Promise<Record<string, number>> {
  const rows = await query<{ slug: string; n: number }>(
    `SELECT c.slug,
            (SELECT count(*)::int FROM (SELECT 1 FROM posts p
               WHERE p.category_id = c.id AND p.created_at > x.since AND NOT p.is_blinded AND NOT p.is_suppressed
                 AND (p.seed_key IS NULL OR p.seed_key NOT LIKE 'ibol:%')
               LIMIT 100) t) AS n
       FROM unnest($1::text[], $2::timestamptz[]) AS x(slug, since)
       JOIN categories c ON c.slug = x.slug`,
    [pairs.map((p) => p.slug), pairs.map((p) => p.since.toISOString())],
  );
  return Object.fromEntries(rows.filter((r) => r.n > 0).map((r) => [r.slug, r.n]));
}

/**
 * 방 안 말머리·정보·정모 옆 숫자 (Sprint 93) — since 이후 올라온 글 수. 칸마다 최대 99까지만 센다.
 * 키: 말머리 이름(질문·자랑…), info, meetup. 0 인 칸은 빼고 돌려준다.
 */
export async function filterCounts(slug: string, since: Date, heads: readonly string[], infoNotHeads: readonly string[] = []): Promise<Record<string, number>> {
  const rows = await query<{ k: string; n: number }>(
    `WITH recent AS (
       SELECT p.title, p.post_type FROM posts p JOIN categories c ON c.id = p.category_id
        WHERE c.slug = $1 AND p.created_at > $2 AND NOT p.is_blinded AND NOT p.is_suppressed
          AND (p.seed_key IS NULL OR p.seed_key NOT LIKE 'ibol:%')
        ORDER BY p.created_at DESC LIMIT 500)
     SELECT h AS k, count(*) FILTER (WHERE r.title LIKE '[' || h || ']%')::int AS n FROM unnest($3::text[]) h CROSS JOIN recent r GROUP BY h
     UNION ALL SELECT 'info', count(*) FILTER (WHERE post_type = 'info' AND NOT (title LIKE ANY(SELECT '[' || x || ']%' FROM unnest($4::text[]) x)))::int FROM recent
     UNION ALL SELECT 'meetup', count(*) FILTER (WHERE post_type = 'meetup')::int FROM recent
     UNION ALL SELECT 'chat', count(*)::int FROM comments cm JOIN posts p ON p.id = cm.post_id
       WHERE p.seed_key = 'roomchat:' || $1 AND cm.created_at > $2 AND cm.ai_hidden_at IS NULL`,
    [slug, since.toISOString(), heads, infoNotHeads],
  );
  return Object.fromEntries(rows.filter((r) => r.n > 0).map((r) => [r.k, Math.min(r.n, 99)]));
}

export type RoomTools = { products: boolean; facts: boolean; renewals: boolean };

/**
 * 방 상단 도구(제품별·성분/스펙별·라벨 변경)는 그 방에 데이터가 있을 때만 보인다 (Sprint 42).
 * 원래 팩트체크용으로 모든 방에 있던 버튼이, 데이터 없는 방에서 빈 화면으로 이어지지 않게. 모두 EXISTS 라 바로 끝난다.
 */
export async function roomTools(categoryId: number): Promise<RoomTools> {
  const rows = await query<RoomTools>(
    `SELECT EXISTS (SELECT 1 FROM products p JOIN post_products pp ON pp.product_id = p.id JOIN posts po ON po.id = pp.post_id
                     WHERE p.category_id = $1 AND p.merged_into IS NULL AND NOT po.is_blinded) AS products,
            EXISTS (SELECT 1 FROM products p JOIN product_facts f ON f.product_id = p.id JOIN posts po ON po.id = f.post_id
                     WHERE p.category_id = $1 AND NOT po.is_blinded) AS facts,
            EXISTS (SELECT 1 FROM products p JOIN product_renewals r ON r.product_id = p.id WHERE p.category_id = $1) AS renewals`,
    [categoryId],
  );
  return rows[0]!;
}

/** 성분표가 중심인 방은 "성분별", 나머지는 "스펙별" */
export const INGREDIENT_ROOMS = new Set(["supplements", "pet-food"]);

/** 방 숨기기/다시 보이기 (Sprint 81) */
export async function setRoomHidden(slug: string, hidden: boolean): Promise<boolean> {
  const rows = await query<{ id: number }>("UPDATE categories SET is_hidden = $2 WHERE slug = $1 RETURNING id", [slug, hidden]);
  return rows.length > 0;
}
