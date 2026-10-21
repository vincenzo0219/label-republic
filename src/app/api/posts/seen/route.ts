import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { addSeen } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";

const schema = z.object({ ids: z.array(z.string().regex(/^\d{1,18}$/)).min(1).max(30) });

/**
 * POST /api/posts/seen {ids} — 목록에서 화면에 보인 글 (Sprint 96). 조회수에 더한다.
 * 같은 브라우저는 글마다 한 번만 보낸다(localStorage). 한 사람이 부풀리지 못하게 분당 횟수를 묶는다.
 */
export const POST = route(async (req) => {
  if (!(await hit(`seen:${fingerprint(req.headers)}`, 20, 60 * 1000))) throw tooMany();
  const { ids } = await parseBody(req, schema);
  addSeen([...new Set(ids)]);
  return json({ ok: true });
});
