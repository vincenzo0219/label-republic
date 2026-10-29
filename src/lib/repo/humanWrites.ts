/**
 * 🙋 최근 사람 글·댓글 모아 보기 (10/29 대표님 "사람이 글을 입력하면 댓글이던 뭐든간에, 바로 내가 댓글을 달 수 있게 링크를").
 * 2시간 점검이 읽는다. 운영 닉네임·AI 글은 빼고, 숨은 댓글 글(seed_key roomchat:…)은 사람이 실제로 보는 화면 주소로 바꾼다.
 */
import { query } from "../db";
import { OPERATOR_NICKS } from "./metrics";

export type HumanWrite = { kind: "post" | "comment" | "neo" | "game" | "gig"; id: string; room: string; nickname: string; text: string; url: string; at: string };

const NOT_HUMAN = [...OPERATOR_NICKS, "AI 큐레이터", "비즈파일럿"];

/** 숨은 댓글 글이면 사람이 보는 화면으로 */
export function talkUrl(seedKey: string | null, slug: string, postId: string, commentId?: string): string {
  const c = commentId ? `#c${commentId}` : "";
  const m = seedKey?.match(/^roomchat:(neo|tennis|singles-ev):(\d+)$/);
  if (m?.[1] === "neo") return `/neo/${m[2]}${c}`;
  if (m?.[1] === "tennis") return `/c/${encodeURIComponent("테니스-덕후방")}?tab=games#game-${m[2]}`;
  if (m?.[1] === "singles-ev") return `/singles/${m[2]}${c}`;
  if (seedKey === `roomchat:${slug}`) return `/c/${encodeURIComponent(slug)}/chat${c}`;
  return `/posts/${postId}${c}`;
}

export async function humanWrites(hours: number): Promise<HumanWrite[]> {
  const since = `${Math.max(1, Math.min(72, hours))} hours`;
  const [comments, posts] = await Promise.all([
    query<{ id: string; post_id: string; nickname: string; body: string; created_at: string; seed_key: string | null; slug: string; room: string }>(
      `SELECT cm.id::text, cm.post_id::text, cm.nickname, cm.body, cm.created_at, p.seed_key, c.slug, c.name AS room
         FROM comments cm JOIN posts p ON p.id = cm.post_id JOIN categories c ON c.id = p.category_id
        WHERE cm.created_at > now() - $1::interval AND NOT cm.is_ai_curated AND cm.author_fingerprint IS NOT NULL
          AND cm.nickname <> ALL($2::text[]) ORDER BY cm.created_at DESC LIMIT 200`,
      [since, NOT_HUMAN],
    ),
    query<{ id: string; nickname: string; title: string; created_at: string; room: string }>(
      `SELECT p.id::text, p.nickname, p.title, p.created_at, c.name AS room
         FROM posts p JOIN categories c ON c.id = p.category_id
        WHERE p.created_at > now() - $1::interval AND NOT p.is_ai_curated AND p.author_fingerprint IS NOT NULL
          AND p.nickname <> ALL($2::text[]) AND (p.seed_key IS NULL OR p.seed_key NOT LIKE 'roomchat:%')
        ORDER BY p.created_at DESC LIMIT 100`,
      [since, NOT_HUMAN],
    ),
  ]);
  const [neo, games] = await Promise.all([
    query<{ id: string; title: string; created_at: string }>(
      "SELECT id::text, title, created_at FROM neo_items WHERE created_at > now() - $1::interval ORDER BY created_at DESC LIMIT 50",
      [since],
    ),
    query<{ id: string; nickname: string; court: string; created_at: string }>(
      "SELECT id::text, nickname, court, created_at FROM tennis_games WHERE created_at > now() - $1::interval ORDER BY created_at DESC LIMIT 50",
      [since],
    ),
  ]);
  const out: HumanWrite[] = [
    ...comments.map((r) => ({ kind: "comment" as const, id: r.id, room: r.room, nickname: r.nickname, text: r.body.slice(0, 80), url: talkUrl(r.seed_key, r.slug, r.post_id, r.id), at: r.created_at })),
    ...posts.map((r) => ({ kind: "post" as const, id: r.id, room: r.room, nickname: r.nickname, text: r.title.slice(0, 80), url: `/posts/${r.id}`, at: r.created_at })),
    ...neo.map((r) => ({ kind: "neo" as const, id: r.id, room: "💳 넣어둬", nickname: "익명", text: r.title.slice(0, 80) || "(사진)", url: `/neo/${r.id}`, at: r.created_at })),
    ...games.map((r) => ({ kind: "game" as const, id: r.id, room: "🎾 테니스방", nickname: r.nickname, text: r.court, url: `/c/${encodeURIComponent("테니스-덕후방")}?tab=games#game-${r.id}`, at: r.created_at })),
  ];
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}
