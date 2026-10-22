import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { MAX_ME_IDS, changeMyPin, myActivity, renameMine } from "@/lib/repo/me";
import { nickname, pin } from "@/lib/validation";

const ids = z.array(z.string().regex(/^\d{1,18}$/)).max(MAX_ME_IDS).default([]);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activity"), posts: ids, comments: ids }),
  z.object({ action: z.literal("rename"), pw: pin, nickname, posts: ids, comments: ids }),
  z.object({ action: z.literal("pin"), pw: pin, newPw: pin, posts: ids, comments: ids }),
]);

/**
 * POST /api/me — 마이페이지 (10/22). 내 글·댓글 목록은 브라우저가 기억한 번호를 보내고, 서버는 저장하지 않는다.
 * rename·pin 은 비밀번호가 맞는 글·댓글만 바꾼다 (글마다 scrypt 라 사람당 분당 5회).
 */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  const fp = fingerprint(req.headers);
  if (input.action === "activity") {
    if (!(await hit(`me:list:${fp}`, 30, 60_000))) throw tooMany();
    return json(await myActivity(input.posts, input.comments, fp));
  }
  if (!(await hit(`me:edit:${fp}`, 5, 60_000))) throw tooMany();
  if (input.action === "rename") return json(await renameMine(input.pw, input.nickname, input.posts, input.comments, fp));
  return json(await changeMyPin(input.pw, input.newPw, input.posts, input.comments, fp));
});
