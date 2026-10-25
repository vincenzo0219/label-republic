import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { setOwnerAlert, testOwnerAlert } from "@/lib/repo/ownerAlert";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.object({
  endpoint: z.string().url().max(1000),
  /** status: 지금 상태만 · on/off · test: 이 기기로 테스트 알림 */
  action: z.enum(["status", "on", "off", "test"]),
});

/** POST /api/admin/owner-alert {endpoint, action} — 🔔 사람 글·댓글 알림 (이 기기, 10/25) */
export const POST = route(async (req) => {
  const { endpoint, action } = await parseBody(req, schema);
  if (action === "test") return json({ on: await setOwnerAlert(endpoint, null), result: await testOwnerAlert(endpoint) });
  return json({ on: await setOwnerAlert(endpoint, action === "status" ? null : action === "on") });
});
