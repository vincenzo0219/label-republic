/**
 * 🎾 게임 모집마다 댓글 (10/29 대표님 "오픈채팅이 없는데"). 넣어둬 neoTalk 와 같은 방식:
 * 숨은 방 tennis-talk 에 게임마다 숨은 글 하나(seed_key roomchat:tennis:<번호>)를 두고 그 댓글로 참여한다.
 */
import { query } from "../db";
import { notFound } from "../errors";

export const TENNIS_TALK_ROOM = "tennis-talk";
export const tennisTalkKey = (gameId: string) => `roomchat:tennis:${gameId}`;

/** 게임의 댓글 글 번호 (없으면 만든다). 가려진 게임은 404 */
export async function ensureTennisTalk(gameId: string): Promise<{ postId: string }> {
  if (!/^\d{1,18}$/.test(gameId)) throw notFound("게임");
  const [g] = await query<{ court: string; play_date: string; ai_hidden_reason: string | null }>(
    "SELECT court, play_date::text AS play_date, ai_hidden_reason FROM tennis_games WHERE id = $1",
    [gameId],
  );
  if (!g || g.ai_hidden_reason) throw notFound("게임");
  const key = tennisTalkKey(gameId);
  await query(
    `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
     SELECT c.id, '노방장', 'tennis-talk', $3, '참여하고 싶으면 댓글로 남겨 주세요.', $2, 'tennis-talk', 'chat'
       FROM categories c WHERE c.slug = $1
     ON CONFLICT (seed_key) DO NOTHING`,
    [TENNIS_TALK_ROOM, key, `🎾 ${g.play_date.slice(5).replace("-", "/")} ${g.court}`.slice(0, 120)],
  );
  const [p] = await query<{ id: string }>("SELECT id::text FROM posts WHERE seed_key = $1", [key]);
  return { postId: p!.id };
}

/** 목록 카드에 붙일 댓글 수 (글이 없으면 0) */
export async function tennisTalkCounts(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const rows = await query<{ seed_key: string; comment_count: number }>(
    "SELECT seed_key, comment_count FROM posts WHERE seed_key = ANY($1::text[])",
    [ids.map(tennisTalkKey)],
  );
  return Object.fromEntries(ids.map((id) => [id, rows.find((r) => r.seed_key === tennisTalkKey(id))?.comment_count ?? 0]));
}
