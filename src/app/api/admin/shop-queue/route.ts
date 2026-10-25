import { z } from "zod";
import { notFound } from "@/lib/errors";
import { json, parseBody, route } from "@/lib/http";
import { query } from "@/lib/db";
import { deleteQueueItem, listQueue, setTitleOverrides, upsertQueueItem } from "@/lib/repo/shopQueue";
import { feedState, feedUrl } from "@/lib/repo/shopFeed";
import { runShopRoom } from "@/lib/jobs/shopRoom";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
// 🏪 오늘도 장사중 글 대기열 (10/25). 평소엔 서버가 비즈파일럿 피드를 10분마다 읽어 채운다 — 여기는 확인·손보기용
const iso = z.string().refine((v) => /[zZ]|[+-]\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "시간대가 붙은 ISO 시각이어야 해요.");
const KEY = /^(\d{4}-\d{2}-\d{2}-\d{4}|pin:[\p{L}]{2,4})$/u;
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    /** 피드 id '2026-10-26-0830' · 고정 글은 'pin:계산' */
    key: z.string().regex(KEY),
    /** 고정 글은 비워 두면 바로 */
    publishAt: iso.optional(),
    head: z.string().min(2).max(4),
    title: z.string().trim().min(2).max(120),
    body: z.string().trim().min(1).max(20_000),
    imageUrls: z.array(z.string().max(500)).max(6).default([]),
    pinned: z.boolean().default(false),
    /** 비우면 서버 값 */
    pin: z.string().regex(/^\d{4}$/).optional(),
  }),
  /** 질문형 제목 → 단정문 (key → 제목, 빈 문자열이면 지움). 피드보다 먼저 넣어도 된다 */
  z.object({ action: z.literal("titles"), titles: z.record(z.string().regex(KEY), z.string().max(120)) }),
  z.object({ action: z.literal("delete"), key: z.string().max(40) }),
  /** 지금 한 번 돌리기 (피드 읽기·때가 된 글·공지·모아 보기) */
  z.object({ action: z.literal("run"), feed: z.boolean().default(true) }),
]);

/** GET /api/admin/shop-queue — 피드 상태 + 안 올라간 칸 + 최근 8일 올라간 칸 + 제목 바꾸기 */
export const GET = route(async () =>
  json({
    feed: { url: feedUrl(), enabled: process.env.SHOP_FEED_ENABLED !== "0", ...(await feedState()) },
    items: await listQueue(),
    titles: await query("SELECT key, title FROM shop_title_overrides ORDER BY key"),
  }),
);

/** POST /api/admin/shop-queue — 넣기·고치기(upsert) · 제목 바꾸기(titles) · 지우기(delete) · 지금 돌리기(run) */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  if (input.action === "run") return json(await runShopRoom(new Date(), { forceFeed: input.feed }));
  if (input.action === "titles") return json({ saved: await setTitleOverrides(input.titles) });
  if (input.action === "delete") {
    if (!(await deleteQueueItem(input.key))) throw notFound("칸");
    return json({ ok: true });
  }
  const publishAt = input.publishAt ? new Date(input.publishAt) : new Date();
  return json(await upsertQueueItem({ ...input, publishAt }), 201);
});
