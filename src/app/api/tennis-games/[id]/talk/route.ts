import { json, route } from "@/lib/http";
import { ensureTennisTalk } from "@/lib/repo/tennisTalk";

/** POST /api/tennis-games/:id/talk — 💬 이 게임의 댓글 글 번호 (없으면 만든다). 댓글은 /api/posts/:postId/comments 로 */
export const POST = route<{ id: string }>(async (_req, { id }) => json(await ensureTennisTalk(id)));
