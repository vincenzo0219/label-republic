import { HttpError } from "@/lib/errors";
import { json, route } from "@/lib/http";
import { visitorHash } from "@/lib/metrics";
import { cookieOf } from "@/lib/pkHttp";
import { pkWithAi } from "@/lib/repo/pk";

/** POST /api/pk/:id/ai — 10초 동안 상대가 없으면 🤖 노방장 AI 와 (그사이 누가 왔으면 실시간 그대로) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const vid = cookieOf(req);
  if (!vid || !/^\d{1,18}$/.test(id)) throw new HttpError(404, "no_match", "대결을 찾지 못했어요");
  return json(await pkWithAi(id, visitorHash(vid)));
});
