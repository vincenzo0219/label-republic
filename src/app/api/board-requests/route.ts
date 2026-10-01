import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { createBoardRequest, getBoardThreshold, listBoardRequests, voteBoardRequest } from "@/lib/repo/board-requests";
import { boardRequestSchema } from "@/lib/validation";

export const GET = route(async () =>
  json({ requests: await listBoardRequests(), threshold: (await getBoardThreshold()).needed }),
);

/** POST /api/board-requests {name, description} — 신규 방 개설 요청 */
export const POST = route(async (req) => {
  if (!(await hit(`board:create:${fingerprint(req.headers)}`, 3, 60 * 60 * 1000))) throw tooMany();
  const { name, description } = await parseBody(req, boardRequestSchema);
  const created = await createBoardRequest(name, description);
  // 요청한 사람도 원하는 사람이다 — 첫 동의로 센다 (Sprint 39). 같은 fingerprint 는 다시 동의할 수 없다.
  const { request } = await voteBoardRequest(created.id, fingerprint(req.headers));
  return json({ request }, 201);
});
