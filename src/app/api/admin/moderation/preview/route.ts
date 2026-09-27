import { HttpError } from "@/lib/errors";
import { json, route } from "@/lib/http";
import { previewAlertVoid } from "@/lib/repo/operator";

/** GET /api/admin/moderation/preview?alertId= — 무효화 대상 건수 미리보기 */
export const GET = route(async (req) => {
  const alertId = new URL(req.url).searchParams.get("alertId") ?? "";
  if (!/^\d{1,18}$/.test(alertId)) throw new HttpError(400, "invalid_input", "알림 번호를 확인하세요.");
  return json(await previewAlertVoid(alertId));
});
