import { after } from "next/server";
import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { agentHash, fingerprint, networkHash } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { badgesSafe } from "@/lib/repo/badges";
import { aiModerateComment } from "@/lib/repo/comments";
import { claimNickname } from "@/lib/repo/nicknames";
import { assertCanWrite } from "@/lib/repo/write-limits";
import { recentWriting, submitWriting, weeklyWriters } from "@/lib/repo/writingLog";
import { nickname, pin } from "@/lib/validation";
import { MAX_CHARS, NOTE_MAX, WRITING_ROOMS } from "@/lib/writingLog";

const schema = z.object({
  room: z.string().max(100),
  nickname,
  pw: pin,
  chars: z.coerce
    .number({ message: "글자수를 숫자로 적어 주세요." })
    .int("글자수는 정수로 적어 주세요.")
    .min(1, "글자수는 1자 이상이에요.")
    .max(MAX_CHARS, "글자수는 100,000자까지예요."),
  note: z.string().trim().max(NOTE_MAX, `한 줄은 ${NOTE_MAX}자까지예요.`).optional(),
});

/** GET /api/writing-log?room= — 이번 주 많이 쓴 작가 5명 + 어제·오늘 인증 + 배지 */
export const GET = route(async (req) => {
  const room = new URL(req.url).searchParams.get("room") ?? "";
  if (!WRITING_ROOMS.has(room)) return json({ top: [], recent: [], badges: {} });
  const [top, recent] = await Promise.all([weeklyWriters(room), recentWriting(room)]);
  const badges = await badgesSafe(room, [...top.map((t) => t.nickname), ...recent.map((r) => r.nickname)]);
  return json({ top, recent, badges });
});

/** POST /api/writing-log {room, nickname, pw, chars, note?} — 오늘 인증 (같은 날 다시 보내면 고친다) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`writing:create:${fp}`, 10, 60 * 60 * 1000))) throw tooMany();
  const net = networkHash(req.headers);
  const input = await parseBody(req, schema);
  await claimNickname(input.nickname, input.pw);
  await assertCanWrite({ fingerprint: fp, net, agent: agentHash(req.headers) });
  const { entry, updated } = await submitWriting({ room: input.room, nickname: input.nickname, pin: input.pw, chars: input.chars, note: input.note, fingerprint: fp, net });
  // 한 줄은 댓글처럼 등록 직후 Claude 가 한 번 더 본다
  if (entry.comment_id) {
    const id = entry.comment_id;
    after(() => aiModerateComment(id).catch((err) => console.error("[moderation]", err)));
  }
  return json({ entry, updated }, updated ? 200 : 201);
});
