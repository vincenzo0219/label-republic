import { notFound, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { ensureProgramPost, getProgram } from "@/lib/repo/kidsPrograms";

/** POST /api/kids-programs/:id/thread — 첫 댓글 직전에 프로그램 글을 만든다 (있으면 그대로) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  if (!(await hit(`kids-thread:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const p = await getProgram(decodeURIComponent(id));
  if (!p) throw notFound("프로그램");
  return json({ postId: await ensureProgramPost(p) });
});
