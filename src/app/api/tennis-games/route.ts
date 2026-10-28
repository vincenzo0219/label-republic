import { after } from "next/server";
import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { HttpError, tooMany } from "@/lib/errors";
import { agentHash, fingerprint, networkHash } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { claimNickname } from "@/lib/repo/nicknames";
import { assertCanWrite } from "@/lib/repo/write-limits";
import { createGame, listGames, moderateGame } from "@/lib/repo/tennisGames";
import { SIDOS } from "@/lib/instructorRoom";
import { GAME_TYPES, gameInputSchema } from "@/lib/tennisGames";

const filterSchema = z.object({
  sido: z.string().refine((v) => SIDOS.includes(v)).optional(),
  sigungu: z.string().max(20).optional(),
  type: z.enum(GAME_TYPES).optional(),
  when: z.enum(["today", "tomorrow", "weekend"]).optional(),
  page: z.coerce.number().int().min(1).max(50).optional(),
});

/** GET /api/tennis-games?sido=&sigungu=&type=&when=today|tomorrow|weekend&page= — 🎾 게임 모집 목록 (연락처 없음) */
export const GET = route(async (req) => {
  const sp = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ""));
  const f = filterSchema.safeParse(sp);
  if (!f.success) throw new HttpError(400, "invalid_filter", "거르기 값이 올바르지 않습니다.");
  const r = await listGames(f.data);
  return new Response(JSON.stringify(r), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
});

/** POST /api/tennis-games — 게임 모집 올리기 */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`game:create:${fp}`, 10, 3600_000))) throw tooMany();
  if (!(await hit(`game:create-net:${networkHash(req.headers)}`, 30, 3600_000))) throw tooMany();
  const input = await parseBody(req, gameInputSchema.passthrough());
  await claimNickname(input.nickname, input.pw);
  await assertCanWrite({ fingerprint: fp, net: networkHash(req.headers), agent: agentHash(req.headers) });
  try {
    const r = await createGame(input, { fingerprint: fp, net: networkHash(req.headers) });
    after(() => moderateGame(r.id).catch((err) => console.error("[game moderation]", err)));
    return json(r, 201);
  } catch (err) {
    const id = (err as { gameId?: string }).gameId;
    if (err instanceof HttpError && id) return json({ error: { code: err.code, message: err.message }, id }, err.status);
    throw err;
  }
});
