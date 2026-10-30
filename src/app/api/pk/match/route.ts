import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { cleanTeam } from "@/lib/pk";
import { visitorOf, withVisitor } from "@/lib/pkHttp";
import { hit } from "@/lib/rate-limit";
import { joinPk } from "@/lib/repo/pk";

const schema = z.object({ team: z.string().max(40).nullable().optional() });

/** POST /api/pk/match {team} — ⚽ 승부차기 상대 찾기 (10/30). 기다리는 사람이 있으면 바로 짝, 없으면 기다린다 */
export const POST = route(async (req) => {
  if (!(await hit(`pk:match:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const { team } = await parseBody(req, schema);
  const v = visitorOf(req);
  return withVisitor(json(await joinPk(v.hash, cleanTeam(team))), v);
});
