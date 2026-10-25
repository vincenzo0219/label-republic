/**
 * 비즈파일럿이 가져가는 주간 숫자 (10/25): 🏪 오늘도 장사중 한 방만 — 탭별 글·조회·댓글, 새로 온 사람, 댓글에서 두 번 넘게 나온 질문.
 * 개인 식별값(방문자 해시·닉네임)은 내보내지 않고 개수만.
 */
import { query } from "../db";
import { SHOP_HEADS } from "../heads";
import { SHOP_AUTHOR, SHOP_ROOM } from "../shopRoom";

/** 질문 비교용: 공백·문장부호·이모지를 지운 소문자 */
export const questionKey = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}\p{Extended_Pictographic}]/gu, "");

/** 댓글 본문에서 질문 문장들 (물음표로 끝나는 문장, 6자 이상) */
export function questionsIn(body: string): string[] {
  return body
    .replace(/\r/g, "")
    .split(/(?<=\?)\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\?$/.test(s) && questionKey(s).length >= 6)
    .map((s) => s.slice(0, 200));
}

/** 같은 질문(공백·부호 무시)이 min 번 이상 나온 것 — 많이 나온 순 */
export function repeatedQuestions(comments: { body: string; post_id: string }[], min = 2) {
  const groups = new Map<string, { text: string; count: number; posts: Set<string> }>();
  for (const c of comments) {
    for (const q of new Set(questionsIn(c.body))) {
      const k = questionKey(q);
      const g = groups.get(k) ?? { text: q, count: 0, posts: new Set<string>() };
      g.count++;
      g.posts.add(c.post_id);
      groups.set(k, g);
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= min)
    .sort((a, b) => b.count - a.count)
    .map((g) => ({ text: g.text, count: g.count, post_ids: [...g.posts] }));
}

export async function shopStats(days: number, now = new Date()) {
  const to = now;
  const from = new Date(now.getTime() - days * 86_400_000);
  const [cat] = await query<{ id: number; created_at: string }>("SELECT id, created_at FROM categories WHERE slug = $1", [SHOP_ROOM]);
  if (!cat) return null;
  const fromDay = new Date(from.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const startDay = new Date(new Date(cat.created_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const heads = SHOP_HEADS.map((h) => h.key);
  const tabRows = await query<{ head: string; posts: number; new_posts: number; views: number; comments: number }>(
    `WITH rp AS (
       SELECT p.id, substring(p.title from '^\\[([^\\]]{2,4})\\]') AS head, p.created_at
         FROM posts p WHERE p.category_id = $1 AND NOT p.is_blinded AND (p.seed_key IS NULL OR p.seed_key NOT LIKE 'roomchat:%')
     )
     SELECT rp.head,
            count(*)::int AS posts,
            count(*) FILTER (WHERE rp.created_at >= $2::timestamptz)::int AS new_posts,
            coalesce(sum((SELECT count(*) FROM page_views v WHERE v.post_id = rp.id AND v.day >= $4::date)), 0)::int AS views,
            coalesce(sum((SELECT count(*) FROM comments c WHERE c.post_id = rp.id AND c.ai_hidden_at IS NULL AND c.created_at >= $2::timestamptz)), 0)::int AS comments
       FROM rp WHERE rp.head = ANY($3::text[]) GROUP BY rp.head`,
    [cat.id, from.toISOString(), heads, fromDay],
  );
  const byHead = new Map(tabRows.map((r) => [r.head, r]));
  const [room] = await query<{ room_views: number; visitors: number; new_visitors: number }>(
    `WITH v AS (
       SELECT pv.visitor_hash, pv.day FROM page_views pv
        WHERE pv.day >= $2::date AND (pv.category_slug = $1 OR pv.post_id IN (SELECT id FROM posts WHERE category_id = $3))
     ), first AS (SELECT visitor_hash, min(day) AS d FROM v GROUP BY visitor_hash)
     SELECT (SELECT count(*) FROM v WHERE day >= $4::date)::int AS room_views,
            (SELECT count(DISTINCT visitor_hash) FROM v WHERE day >= $4::date)::int AS visitors,
            (SELECT count(*) FROM first WHERE d >= $4::date)::int AS new_visitors`,
    [SHOP_ROOM, startDay, cat.id, fromDay],
  );
  // 새 멤버: 이 방에 처음 글·댓글을 남긴 닉네임 수 (그 전엔 이 방에 쓴 적 없는)
  const [people] = await query<{ new_people: number }>(
    `WITH w AS (
       SELECT nickname, created_at FROM posts WHERE category_id = $1 AND NOT is_ai_curated AND moderated_by IS DISTINCT FROM 'shop-room' AND moderated_by IS DISTINCT FROM 'room-chat'
       UNION ALL
       SELECT c.nickname, c.created_at FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.category_id = $1 AND NOT c.is_ai_curated
     ) SELECT count(*)::int AS new_people FROM (SELECT nickname, min(created_at) AS first FROM w WHERE nickname <> $3 GROUP BY nickname) x WHERE first >= $2::timestamptz`,
    [cat.id, from.toISOString(), SHOP_AUTHOR],
  );
  const comments = await query<{ body: string; post_id: string }>(
    `SELECT c.body, c.post_id::text FROM comments c JOIN posts p ON p.id = c.post_id
      WHERE p.category_id = $1 AND c.ai_hidden_at IS NULL AND NOT c.is_ai_curated AND c.created_at >= $2::timestamptz`,
    [cat.id, from.toISOString()],
  );
  return {
    room: SHOP_ROOM,
    from: from.toISOString(),
    to: to.toISOString(),
    tabs: SHOP_HEADS.map((h) => {
      const r = byHead.get(h.key);
      return { key: h.key, label: h.label, posts: r?.posts ?? 0, new_posts: r?.new_posts ?? 0, views: r?.views ?? 0, comments: r?.comments ?? 0 };
    }),
    room_views: room?.room_views ?? 0,
    visitors: room?.visitors ?? 0,
    new_visitors: room?.new_visitors ?? 0,
    new_members: people?.new_people ?? 0,
    repeated_questions: repeatedQuestions(comments),
  };
}
