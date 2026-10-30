import { HttpError } from "@/lib/errors";
import { json, route } from "@/lib/http";
import { visitorHash } from "@/lib/metrics";
import { cookieOf } from "@/lib/pkHttp";
import { pkView } from "@/lib/repo/pk";

/** GET /api/pk/:id — ⚽ 승부차기 지금 상태 (내 쪽에서). 이번 킥에 상대가 고른 칸은 둘 다 고르기 전까지 안 보낸다 */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const vid = cookieOf(req);
  if (!vid || !/^\d{1,18}$/.test(id)) throw new HttpError(404, "no_match", "대결을 찾지 못했어요");
  return json(await pkView(id, visitorHash(vid)));
});
