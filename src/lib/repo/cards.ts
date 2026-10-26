/**
 * 🎉 덕질 기념일 카드 · 💪 모두의 응원 카드 (10/26). 대표님 "어차피 글을 안 쓰니까 아주 쉽게".
 * - 기념일 카드: 사람이 고른 것(방·종류·n일째/주년/생일·닉네임)으로 서버가 정해진 틀의 글을 만든다. 날짜는 받지 않는다.
 *   자유 입력이 없고 고칠 수 없다 (updatePost 가 card_kind 글을 거절). 한 기기(fingerprint)·한 방에 하루 한 장.
 * - 응원 카드: 운영자가 만든다 (POST /api/admin/cheer-cards). 운영자는 누르지 않는다.
 * - 🎉 축하해요 · 💪 응원해요: 누구나 한 번, 닉네임·비밀번호 없이 방문자 쿠키 해시당 한 번 (👍 공감과 같은 방식, 취소 없음).
 *   운영 자동화는 cheerCard 를 부르지 않는다 — 사람이 누른 것만 센다.
 */
import { randomInt } from "node:crypto";
import { query } from "../db";
import { HttpError, notFound } from "../errors";
import { cardBody, cardTitle, type FanPreset, type Occasion } from "../fanDays";
import { headsFor } from "../heads";
import { roomShortName } from "../myRooms";
import type { CardKind } from "../types";
import { createPost } from "./posts";

/** 운영자 응원 카드 이름 (운영 닉네임, 사람끼리 반응에서 빠진다) */
export const CHEER_CARD_NICK = "노방장";

type Room = { id: number; slug: string; name: string };

/** 카드를 올릴 수 있는 방 (숨긴 방·정보만 보여 주는 방 제외) */
export async function cardRoom(slug: string): Promise<Room> {
  const [r] = await query<Room>("SELECT id, slug, name FROM categories WHERE slug = $1 AND NOT is_hidden AND NOT info_only", [slug]);
  if (!r) throw new HttpError(400, "invalid_category", "카드를 올릴 수 없는 방이에요.");
  return r;
}

/** 📸 자랑 말머리가 있는 방이면 그 탭에도 보이게 */
const withHead = (slug: string, title: string) => (headsFor(slug).some((h) => h.key === "자랑") ? `[자랑] ${title}` : title);

export async function createFanCard(input: {
  room: string;
  preset: FanPreset;
  occasion: Occasion;
  nickname: string;
  pin: string;
  fingerprint: string;
  network?: string;
  agent?: string;
}): Promise<{ id: string; title: string }> {
  const room = await cardRoom(input.room);
  const short = roomShortName(room);
  const post = await createPost({
    categorySlug: room.slug,
    nickname: input.nickname,
    pin: input.pin,
    title: withHead(room.slug, cardTitle(input.nickname, input.preset, short, input.occasion)),
    body: cardBody(input.nickname, input.preset, short, input.occasion),
    fingerprint: input.fingerprint,
    network: input.network,
    agent: input.agent,
    postType: "chat",
    summary: null,
    cardKind: "fanday",
  });
  return { id: post.id, title: post.title };
}

/** 💪 모두의 응원 카드 (운영자) — "💪 오늘 춘천마라톤 뛰는 분들 응원해요" */
export async function createCheerCard(input: { room: string; title: string; body?: string }): Promise<{ id: string; title: string }> {
  const room = await cardRoom(input.room);
  const post = await createPost({
    categorySlug: room.slug,
    nickname: CHEER_CARD_NICK,
    pin: String(randomInt(10000)).padStart(4, "0"),
    title: input.title,
    body: input.body?.trim() || `${input.title}\n💪 응원해요 버튼 하나로 같이 응원해 주세요.`,
    postType: "chat",
    summary: null,
    cardKind: "cheer",
  });
  return { id: post.id, title: post.title };
}

export type TodayCard = { id: string; title: string; card_kind: CardKind; cheers: number; room_slug: string; room_name: string };

/** 🎉 오늘 축하할 덕후: 이 방들의 오늘(KST) 카드 (가려진 것 빼고, 최신순) */
export async function todayCards(slugs: readonly string[], limit = 10): Promise<TodayCard[]> {
  if (!slugs.length) return [];
  return query<TodayCard>(
    `SELECT p.id::text, p.title, p.card_kind, c.slug AS room_slug, c.name AS room_name,
            (SELECT count(*)::int FROM post_cheers pc WHERE pc.post_id = p.id) AS cheers
       FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE c.slug = ANY($1::text[]) AND p.card_kind IS NOT NULL AND NOT p.is_blinded AND NOT p.is_suppressed
        AND NOT c.is_hidden AND NOT c.info_only
        AND p.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
      ORDER BY p.created_at DESC
      LIMIT $2`,
    [[...slugs], limit],
  );
}

export async function cheerCounts(postIds: string[]): Promise<Record<string, number>> {
  const ids = postIds.filter((id) => /^\d{1,18}$/.test(id));
  if (!ids.length) return {};
  const rows = await query<{ id: string; n: number }>(
    "SELECT post_id::text AS id, count(*)::int AS n FROM post_cheers WHERE post_id = ANY($1::bigint[]) GROUP BY post_id",
    [ids],
  );
  return Object.fromEntries(ids.map((id) => [id, rows.find((r) => r.id === id)?.n ?? 0]));
}

/** 🎉 축하해요 · 💪 응원해요. 이미 눌렀으면 그대로. 결과: 이 카드의 수 */
export async function cheerCard(postId: string, visitorHash: string, fingerprint: string | null): Promise<number> {
  if (!/^\d{1,18}$/.test(postId)) throw notFound();
  const [p] = await query<{ id: string }>(
    `SELECT p.id::text FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1 AND p.card_kind IS NOT NULL AND NOT p.is_blinded AND NOT c.info_only`,
    [postId],
  );
  if (!p) throw notFound("카드");
  await query("INSERT INTO post_cheers (post_id, visitor_hash, fingerprint) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [postId, visitorHash, fingerprint]);
  return (await cheerCounts([postId]))[postId] ?? 0;
}
