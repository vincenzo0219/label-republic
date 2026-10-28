/**
 * 💳 넣어둬 글마다 댓글 · 본 사람 수 (10/28 대표님). 만남 행사 카드(singlesTalk)와 같은 방식:
 * 넣어둬 글마다 숨은 방 neo 에 숨은 글 하나(seed_key roomchat:neo:<번호>)를 두고 그 댓글로 쌓는다. 본 사람 수는 그 글의 조회수.
 */
import { query } from "../db";

export const NEO_TALK_ROOM = "neo";
export const neoTalkKey = (neoId: string) => `roomchat:neo:${neoId}`;

export type NeoTalk = { postId: string; comments: number; views: number };

/** 넣어둬 글들의 댓글 글을 (없으면 만들어) 돌려준다 */
export async function ensureNeoTalks(items: { id: string; title: string }[]): Promise<Record<string, NeoTalk>> {
  if (!items.length) return {};
  const keys = items.map((i) => neoTalkKey(i.id));
  await query(
    `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
     SELECT c.id, '노방장', 'neo-talk', '💳 ' || left(m.title, 110), '이 고민에 한마디 (살까 말까 이유·대안).', m.key, 'neo-talk', 'chat'
       FROM categories c, unnest($2::text[], $3::text[]) AS m(key, title)
      WHERE c.slug = $1 AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.seed_key = m.key)
     ON CONFLICT (seed_key) DO NOTHING`,
    [NEO_TALK_ROOM, keys, items.map((i) => i.title || "이거")],
  );
  const rows = await query<{ seed_key: string; id: string; comment_count: number; view_count: number }>(
    "SELECT seed_key, id::text, comment_count, view_count FROM posts WHERE seed_key = ANY($1::text[])",
    [keys],
  );
  const out: Record<string, NeoTalk> = {};
  for (const i of items) {
    const r = rows.find((x) => x.seed_key === neoTalkKey(i.id));
    if (r) out[i.id] = { postId: r.id, comments: r.comment_count, views: r.view_count };
  }
  return out;
}
