import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { saveSocialToken } from "@/lib/social";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.object({ platform: z.enum(["threads", "instagram"]), token: z.string().trim().min(20).max(1000) });

/** POST /api/admin/social {platform, token} — Meta 토큰 생성기에서 받은 장기 토큰 저장 (확인 후). 응답에 토큰은 돌려주지 않는다 */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  return json(await saveSocialToken(input.platform, input.token));
});
