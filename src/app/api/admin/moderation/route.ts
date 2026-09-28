import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import {
  BOARD_REJECT_REASONS,
  dismissAlert,
  mergeBoardRequest,
  mergeProduct,
  rejectAppeal,
  rejectBoardRequest,
  releaseSuppression,
  voidAlert,
  type BoardRejectReason,
} from "@/lib/repo/operator";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const id = z.string().regex(/^\d{1,18}$/, "번호를 확인하세요.");
// 메모는 공개 투명성 기록에 그대로 실린다 — 신고인·개인정보를 적지 말 것
const note = z.string().trim().max(300).default("");

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("void_alert"), alertId: id, note }),
  z.object({ action: z.literal("dismiss_alert"), alertId: id, note }),
  z.object({ action: z.literal("release_suppression"), postId: id, note }),
  z.object({ action: z.literal("reject_appeal"), postId: id, note: z.string().trim().min(1, "기각 사유를 적어주세요.").max(300) }),
  z.object({
    action: z.literal("reject_board_request"),
    requestId: id,
    reason: z.enum(Object.keys(BOARD_REJECT_REASONS) as [BoardRejectReason, ...BoardRejectReason[]]),
    note,
  }),
  z.object({ action: z.literal("merge_board_request"), requestId: id, intoId: id, note }),
  z.object({ action: z.literal("merge_product"), productId: id, intoId: id, note }),
]);

/** POST /api/admin/moderation — 운영자 조치 (알림 오탐 닫기 외에는 모두 /transparency 에 공개) */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  switch (input.action) {
    case "void_alert":
      return json({ ok: true, ...(await voidAlert(input.alertId, input.note)) });
    case "dismiss_alert":
      await dismissAlert(input.alertId, input.note);
      return json({ ok: true });
    case "release_suppression":
      await releaseSuppression(input.postId, input.note);
      return json({ ok: true });
    case "reject_appeal":
      await rejectAppeal(input.postId, input.note);
      return json({ ok: true });
    case "reject_board_request":
      await rejectBoardRequest(input.requestId, input.reason, input.note);
      return json({ ok: true });
    case "merge_board_request":
      return json({ ok: true, ...(await mergeBoardRequest(input.requestId, input.intoId, input.note)) });
    case "merge_product":
      return json({ ok: true, ...(await mergeProduct(input.productId, input.intoId, input.note)) });
  }
});
