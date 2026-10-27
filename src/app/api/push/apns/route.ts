import { z } from "zod";
import { isApnsToken } from "@/lib/apns";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { registerApnsDevice, removeApnsDevice } from "@/lib/repo/push";

/** 앱(nobangjang-ios)은 대문자로 받은 토큰을 소문자로 바꿔 보낸다 */
const token = z.string().transform((s) => s.toLowerCase()).refine(isApnsToken, "invalid_token");
const schema = z.union([
  z.object({ action: z.literal("unsubscribe"), token, platform: z.literal("ios").optional(), bundleId: z.string().max(100).optional() }),
  z.object({ platform: z.literal("ios"), token, bundleId: z.string().max(100).optional(), environment: z.string().max(20).optional() }),
]);

/**
 * POST /api/push/apns — iOS 앱 기기 토큰 등록 {platform:"ios", token} / 해제 {action:"unsubscribe", token} (10/27)
 * 앱 브리지(nobangjang-native.js)가 부른다. 2xx 가 아니면 앱은 registered:false 로 두고 그대로 동작한다.
 */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`push:apns:${fp}`, 30, 3600_000))) throw tooMany();
  const input = await parseBody(req, schema);
  if ("action" in input) await removeApnsDevice(input.token);
  else await registerApnsDevice(input.token, fp);
  return json({ ok: true });
});
