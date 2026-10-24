import { after } from "next/server";
import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { agentHash, fingerprint, networkHash } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { aiModerateComment } from "@/lib/repo/comments";
import { claimNickname } from "@/lib/repo/nicknames";
import { savingsSummary, submitSavings } from "@/lib/repo/savingsLog";
import { assertCanWrite } from "@/lib/repo/write-limits";
import { SAVINGS_NOTE_MAX, SAVINGS_ROOMS, type Bucket } from "@/lib/savingsLog";
import { nickname, pin } from "@/lib/validation";

const schema = z.object({
  room: z.string().max(100),
  nickname,
  pw: pin,
  bucket: z.enum(["lt10", "10to30", "30to50", "50plus"] satisfies Bucket[], { error: "금액 구간을 다시 골라 주세요." }).nullable().optional(),
  note: z.string().trim().max(SAVINGS_NOTE_MAX, `한 줄은 ${SAVINGS_NOTE_MAX}자까지예요.`).optional(),
});

/** GET /api/savings-log?room= — 이번 달 적립 완료 수 + 최근 기록 */
export const GET = route(async (req) => {
  const room = new URL(req.url).searchParams.get("room") ?? "";
  if (!SAVINGS_ROOMS.has(room)) return json({ count: 0, recent: [] });
  return json(await savingsSummary(room));
});

/** POST /api/savings-log {room, nickname, pw, bucket?, note?} — 이번 달 적립 완료 (같은 달 다시 보내면 고친다) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`savings:create:${fp}`, 10, 60 * 60 * 1000))) throw tooMany();
  const net = networkHash(req.headers);
  const input = await parseBody(req, schema);
  await claimNickname(input.nickname, input.pw);
  await assertCanWrite({ fingerprint: fp, net, agent: agentHash(req.headers) });
  const { entry, updated } = await submitSavings({
    room: input.room, nickname: input.nickname, pin: input.pw, bucket: input.bucket ?? null, note: input.note, fingerprint: fp, net,
  });
  if (entry.comment_id) {
    const id = entry.comment_id;
    after(() => aiModerateComment(id).catch((err) => console.error("[moderation]", err)));
  }
  return json({ entry, updated }, updated ? 200 : 201);
});
