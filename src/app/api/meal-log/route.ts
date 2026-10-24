import { after } from "next/server";
import { DIET_ROOMS } from "@/lib/dietRoom";
import { tooMany } from "@/lib/errors";
import { agentHash, fingerprint, networkHash } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { aiModerateComment } from "@/lib/repo/comments";
import { mealSchema, mealSummary, submitMeal } from "@/lib/repo/mealLog";
import { claimNickname } from "@/lib/repo/nicknames";
import { assertCanWrite } from "@/lib/repo/write-limits";

/** GET /api/meal-log?room= — 오늘 인증 인원 + 이번 주 꾸준왕 5명 + 어제·오늘 인증 */
export const GET = route(async (req) => {
  const room = new URL(req.url).searchParams.get("room") ?? "";
  if (!DIET_ROOMS.has(room)) return json({ today: 0, top: [], recent: [] });
  return json(await mealSummary(room));
});

/** POST /api/meal-log {room, nickname, pw, meals[], snack?, note?, image?} — 오늘 인증 (같은 날 다시 보내면 고친다) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`meal:create:${fp}`, 10, 60 * 60 * 1000))) throw tooMany();
  const net = networkHash(req.headers);
  const input = await parseBody(req, mealSchema);
  await claimNickname(input.nickname, input.pw);
  await assertCanWrite({ fingerprint: fp, net, agent: agentHash(req.headers) });
  const { entry, updated } = await submitMeal({
    room: input.room,
    nickname: input.nickname,
    pin: input.pw,
    meals: input.meals,
    snack: input.snack,
    note: input.note,
    image: input.image,
    fingerprint: fp,
    net,
  });
  // 한 줄은 댓글처럼 등록 직후 Claude 가 한 번 더 본다 (식단방 기준 포함)
  if (entry.comment_id) {
    const id = entry.comment_id;
    after(() => aiModerateComment(id).catch((err) => console.error("[moderation]", err)));
  }
  return json({ entry, updated }, updated ? 200 : 201);
});
