import { config } from "@/lib/config";
import { getRule } from "@/lib/repo/rules";
import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { createBoardRequest, listBoardRequests } from "@/lib/repo/board-requests";
import { boardRequestSchema } from "@/lib/validation";

export const GET = route(async () =>
  json({ requests: await listBoardRequests(), threshold: await getRule("board_promotion_votes") }),
);

/** POST /api/board-requests {name, description} — 신규 보드 개설 요청 */
export const POST = route(async (req) => {
  if (!(await hit(`board:create:${fingerprint(req.headers)}`, 3, 60 * 60 * 1000))) throw tooMany();
  const { name, description } = await parseBody(req, boardRequestSchema);
  return json({ request: await createBoardRequest(name, description) }, 201);
});
