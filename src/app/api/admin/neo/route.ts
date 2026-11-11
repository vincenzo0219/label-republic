import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { adminCreateNeo, adminDeleteNeo, adminListNeo, adminRestoreNeo } from "@/lib/repo/neo";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const id = z.string().regex(/^\d{1,18}$/, "번호를 확인하세요.");

/** 노방장 이름으로 올리기: 방문자 글(/api/neo)과 같은 길이·가격 제한 */
const create = z.object({
  title: z.string().trim().min(2, "물건 이름을 2자 이상 적어 주세요.").max(40, "물건 이름은 40자까지예요."),
  price: z.number().int().min(1000, "가격은 1,000원 이상으로 적어 주세요.").max(50_000_000, "가격이 너무 커요."),
  reason: z.string().trim().max(120, "이유는 120자까지예요.").default(""),
  alt: z.string().trim().max(60, "대안은 60자까지예요.").default(""),
});

/** GET /api/admin/neo — 💳 넣어둬 글 전부 (가려진 글·신고 수까지) */
export const GET = route(async () => json({ items: await adminListNeo() }));

/**
 * POST /api/admin/neo {action:"restore", id} — 신고로 가려진 글 다시 보이기
 * POST /api/admin/neo {title, price, reason, alt?} — ✍️ 노방장 이름으로 올리기 (11/11 대표님)
 */
export const POST = route(async (req) => {
  const peek = (await req.clone().json().catch(() => null)) as { action?: unknown } | null;
  if (peek && typeof peek === "object" && "action" in peek) {
    const input = await parseBody(req, z.object({ action: z.literal("restore"), id }));
    await adminRestoreNeo(input.id);
    return json({ ok: true });
  }
  const input = await parseBody(req, create);
  const item = await adminCreateNeo(input);
  return json({ id: item.id, item }, 201);
});

/** DELETE /api/admin/neo {id, sameOwner?} — 운영자 삭제 (같은 사람이 올린 글 전부도) */
export const DELETE = route(async (req) => {
  const input = await parseBody(req, z.object({ id, sameOwner: z.boolean().default(false) }));
  return json({ deleted: await adminDeleteNeo(input.id, input.sameOwner) });
});
