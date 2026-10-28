import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { adminDeleteNeo, adminListNeo, adminRestoreNeo } from "@/lib/repo/neo";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const id = z.string().regex(/^\d{1,18}$/, "번호를 확인하세요.");

/** GET /api/admin/neo — 💳 넣어둬 글 전부 (가려진 글·신고 수까지) */
export const GET = route(async () => json({ items: await adminListNeo() }));

/** POST /api/admin/neo {action:"restore", id} — 신고로 가려진 글 다시 보이기 */
export const POST = route(async (req) => {
  const input = await parseBody(req, z.object({ action: z.literal("restore"), id }));
  await adminRestoreNeo(input.id);
  return json({ ok: true });
});

/** DELETE /api/admin/neo {id, sameOwner?} — 운영자 삭제 (같은 사람이 올린 글 전부도) */
export const DELETE = route(async (req) => {
  const input = await parseBody(req, z.object({ id, sameOwner: z.boolean().default(false) }));
  return json({ deleted: await adminDeleteNeo(input.id, input.sameOwner) });
});
