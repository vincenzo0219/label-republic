import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { saveTestResult } from "@/lib/repo/badges";
import { loginNickname } from "@/lib/repo/nicknames";
import { nickname, pin } from "@/lib/validation";

/**
 * POST /api/test-result {test, result, nickname, pw} — 1분 테스트 결과를 그 사람(닉네임) 것으로 저장한다 (방 배지, 10/24).
 * 이미 등록된 닉네임이고 비밀번호가 맞을 때만. 새 닉네임을 여기서 등록하지는 않는다.
 */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`test-result:${fp}`, 30, 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, z.object({ test: z.string().max(40), result: z.string().max(40), nickname, pw: pin }));
  if (!(await loginNickname(input.nickname, input.pw, fp))) return json({ saved: false });
  return json({ saved: await saveTestResult(input.test, input.nickname, input.result) });
});
