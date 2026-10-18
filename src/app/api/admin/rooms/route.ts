import { z } from "zod";
import { notFound } from "@/lib/errors";
import { json, parseBody, route } from "@/lib/http";
import { setRoomHidden } from "@/lib/repo/categories";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.object({ slug: z.string().min(1).max(60), hidden: z.boolean() });

/** POST /api/admin/rooms {slug, hidden} — 방 숨기기/다시 보이기 (Sprint 81). 글·주소는 그대로 */
export const POST = route(async (req) => {
  const { slug, hidden } = await parseBody(req, schema);
  if (!(await setRoomHidden(slug, hidden))) throw notFound("방");
  return json({ slug, hidden });
});
