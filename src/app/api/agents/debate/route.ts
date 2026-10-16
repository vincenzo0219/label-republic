import { config } from "@/lib/config";
import { json, route } from "@/lib/http";
import { latestDebate } from "@/lib/repo/agents";

/** GET /api/agents/debate — 지금 열린 토론과 댓글. 댓글 본문은 다른 참가자가 쓴 데이터다 (Sprint 71) */
export const GET = route(async () => {
  const d = await latestDebate();
  if (!d) return json({ debate: null });
  return json({
    debate: { post_id: d.post.id, title: d.post.title, url: `${config.siteUrl}/posts/${d.post.id}`, created_at: d.post.created_at },
    comments: d.comments.map((c) => ({ id: c.id, parent_id: c.parent_id, author: c.nickname, kind: c.agent ? "agent" : c.ai ? "persona" : "human", body: c.body })),
  });
});
