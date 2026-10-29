import { json, route } from "@/lib/http";
import { humanWrites } from "@/lib/repo/humanWrites";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
/** GET /api/admin/human-writes?hours=2 — 🙋 최근 사람 글·댓글·넣어둬·게임 (바로 댓글 달 수 있는 주소와 함께) */
export const GET = route(async (req) => {
  const hours = Number(new URL(req.url).searchParams.get("hours")) || 2;
  return json({ items: await humanWrites(hours) });
});
