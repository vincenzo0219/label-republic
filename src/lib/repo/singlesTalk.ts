/**
 * 💌 만남 행사 카드마다 댓글 · 본 사람 수 (10/27 대표님 "이 카드 밑에도 댓글 쓰고 몇명 봤는지 표시").
 * 행사마다 숨은 글 하나(seed_key roomchat:singles-ev:<번호>)의 댓글로 쌓는다. 방 수다방처럼 글 목록에는 안 나오고,
 * 미혼남녀 방이라 연락처·만남 연결 막기(singlesRules)와 AI 자동 가림이 그대로 걸린다. 본 사람 수는 그 글의 조회수.
 */
import { query } from "../db";
import { SINGLES_ROOM } from "../singlesEvents";

export const talkKey = (eventId: string) => `roomchat:singles-ev:${eventId}`;

export type SinglesTalk = { postId: string; comments: number; views: number };

/** 행사들의 댓글 글을 (없으면 만들어) 돌려준다 */
export async function ensureSinglesTalks(events: { id: string; title: string }[]): Promise<Record<string, SinglesTalk>> {
  if (!events.length) return {};
  const keys = events.map((e) => talkKey(e.id));
  const have = await query<{ seed_key: string }>("SELECT seed_key FROM posts WHERE seed_key = ANY($1::text[])", [keys]);
  const missing = events.filter((e) => !have.some((h) => h.seed_key === talkKey(e.id)));
  if (missing.length) {
    await query(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
       SELECT c.id, '노방장', 'singles-talk', '💬 ' || left(m.title, 110), '이 행사 이야기 (신청 꿀팁·질문). 연락처 교환·만남 연결은 할 수 없어요.', m.key, 'singles-talk', 'chat'
         FROM categories c, unnest($2::text[], $3::text[]) AS m(key, title)
        WHERE c.slug = $1
       ON CONFLICT (seed_key) DO NOTHING`,
      [SINGLES_ROOM, missing.map((e) => talkKey(e.id)), missing.map((e) => e.title)],
    );
  }
  const rows = await query<{ seed_key: string; id: string; comment_count: number; view_count: number }>(
    "SELECT seed_key, id::text, comment_count, view_count FROM posts WHERE seed_key = ANY($1::text[])",
    [keys],
  );
  const out: Record<string, SinglesTalk> = {};
  for (const e of events) {
    const r = rows.find((x) => x.seed_key === talkKey(e.id));
    if (r) out[e.id] = { postId: r.id, comments: r.comment_count, views: r.view_count };
  }
  return out;
}
