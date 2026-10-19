/**
 * 💬 방마다 수다방 하나 (Sprint 84) — 카톡처럼 들어가자마자 이어지는 대화. 방마다 특별한 글 하나(seed_key roomchat:방)의
 * 댓글로 쌓여, 실시간·👍 공감·운영 반응·AI 자동 가림·답글 알림을 그대로 쓴다.
 */
import { LOUNGE_SLUG } from "../chatTopics";
import { query } from "../db";

export async function ensureRoomChat(slug: string): Promise<{ postId: string; name: string } | null> {
  // 방 전체 수다방 (Sprint 85): 숨긴 방 하나로 만들어 탭·홈 피드에는 안 나오고 /chat 으로만 들어간다
  if (slug === LOUNGE_SLUG)
    await query("INSERT INTO categories (slug, name, description, is_hidden) VALUES ($1, '전체', '모든 방이 함께 쓰는 수다방', true) ON CONFLICT (slug) DO NOTHING", [slug]);
  const [cat] = await query<{ id: number; name: string }>("SELECT id, name FROM categories WHERE slug = $1", [slug]);
  if (!cat) return null;
  await query(
    `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
     VALUES ($1, '💬 수다방', 'room-chat', $2, '가입 없이 한 줄씩, 편하게 이야기해요.', $3, 'room-chat', 'chat')
     ON CONFLICT (seed_key) DO NOTHING`,
    [cat.id, `💬 ${cat.name} 수다방`, `roomchat:${slug}`],
  );
  const [p] = await query<{ id: string }>("SELECT id::text FROM posts WHERE seed_key = $1", [`roomchat:${slug}`]);
  return p ? { postId: p.id, name: cat.name } : null;
}

export type ChatHit = { id: string; post_id: string; slug: string; room: string; nickname: string; body: string; created_at: string };

/** 검색: 수다방 대화에서 검색어가 모두 들어간 말 (두 글자 이상 검색어만) */
export async function searchRoomChat(terms: string[], limit = 20): Promise<ChatHit[]> {
  const ts = terms.filter((t) => [...t].length >= 2).slice(0, 5);
  if (!ts.length) return [];
  const likes = ts.map((t) => `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  return query<ChatHit>(
    `SELECT c.id::text, p.id::text AS post_id, cat.slug, cat.name AS room, c.nickname, left(c.body, 200) AS body, c.created_at
       FROM comments c JOIN posts p ON p.id = c.post_id JOIN categories cat ON cat.id = p.category_id
      WHERE p.seed_key LIKE 'roomchat:%' AND NOT p.is_blinded AND c.ai_hidden_at IS NULL AND c.body ILIKE ALL($1::text[])
      ORDER BY c.id DESC LIMIT $2`,
    [likes, limit],
  );
}
