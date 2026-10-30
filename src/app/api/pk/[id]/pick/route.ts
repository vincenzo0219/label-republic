import { z } from "zod";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { visitorHash } from "@/lib/metrics";
import { cookieOf } from "@/lib/pkHttp";
import { hit } from "@/lib/rate-limit";
import { pickPk } from "@/lib/repo/pk";

const schema = z.object({ turn: z.number().int().min(0).max(20), pick: z.number().int().min(0).max(2) });

/** POST /api/pk/:id/pick {turn, pick} — 이번 킥에 찰(막을) 칸. 결과는 서버가 두 칸으로 정한다 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  if (!(await hit(`pk:pick:${fingerprint(req.headers)}`, 600, 3600_000))) throw tooMany();
  const vid = cookieOf(req);
  if (!vid || !/^\d{1,18}$/.test(id)) throw new HttpError(404, "no_match", "대결을 찾지 못했어요");
  const { turn, pick } = await parseBody(req, schema);
  return json(await pickPk(id, visitorHash(vid), turn, pick));
});
