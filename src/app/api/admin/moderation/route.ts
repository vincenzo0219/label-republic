import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import {
  BOARD_REJECT_REASONS,
  dismissAlert,
  mergeBoardRequest,
  mergeProduct,
  rejectAppeal,
  rejectBoardRequest,
  releaseAiHide,
  releaseSuppression,
  voidAlert,
  type BoardRejectReason,
} from "@/lib/repo/operator";
import { acceptProposal, hideProposalReason as hideBrandAliasReason, rejectProposal, removeAlias } from "@/lib/repo/brand-aliases";
import { hideProposalReason } from "@/lib/repo/rules";
import * as attrAliases from "@/lib/repo/attr-aliases";
import { clearFactCache } from "@/lib/repo/facts";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const id = z.string().regex(/^\d{1,18}$/, "번호를 확인하세요.");
// 메모는 공개 투명성 기록에 그대로 실린다 — 신고인·개인정보를 적지 말 것
const note = z.string().trim().max(300).default("");

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("void_alert"), alertId: id, note }),
  z.object({ action: z.literal("dismiss_alert"), alertId: id, note }),
  z.object({ action: z.literal("release_suppression"), postId: id, note }),
  // AI 자동 가림 오판 해제 (Sprint 37) — 사유 필수, 공개
  z.object({ action: z.literal("release_ai_hide"), kind: z.enum(["post", "comment"]), id, note: z.string().trim().min(1, "해제 사유를 적어주세요.").max(300) }),
  z.object({ action: z.literal("reject_appeal"), postId: id, note: z.string().trim().min(1, "기각 사유를 적어주세요.").max(300) }),
  z.object({
    action: z.literal("reject_board_request"),
    requestId: id,
    reason: z.enum(Object.keys(BOARD_REJECT_REASONS) as [BoardRejectReason, ...BoardRejectReason[]]),
    note,
  }),
  z.object({ action: z.literal("merge_board_request"), requestId: id, intoId: id, note }),
  z.object({ action: z.literal("merge_product"), productId: id, intoId: id, note }),
  // 규칙 변경 제안 사유에 권리침해가 있을 때 사유만 가린다 (제안·투표는 그대로) — Sprint 21
  z.object({ action: z.literal("hide_rule_reason"), proposalId: id, note: z.string().trim().min(1, "가리는 이유를 적어주세요.").max(300) }),
  // 브랜드 별칭 (Sprint 31): 동의된 제안만 확정, 기각·해제는 사유 필수
  // canonical: 운영자가 대표 브랜드를 직접 고를 때 (두 브랜드 중 하나) — Sprint 33
  z.object({ action: z.literal("accept_brand_alias"), proposalId: id, note, canonical: z.string().min(1).max(60).optional() }),
  z.object({ action: z.literal("hide_brand_alias_reason"), proposalId: id, note: z.string().trim().min(1, "가리는 이유를 적어주세요.").max(300) }),
  z.object({ action: z.literal("reject_brand_alias"), proposalId: id, note: z.string().trim().min(1, "기각 사유를 적어주세요.").max(300) }),
  z.object({ action: z.literal("remove_brand_alias"), aliasKey: z.string().min(1).max(60), note: z.string().trim().min(1, "해제 사유를 적어주세요.").max(300) }),
  // 성분명 별칭 (Sprint 35): 브랜드 별칭과 같은 기준. 해제는 기본 사전도 가능 (방 번호 + 별칭 키)
  z.object({ action: z.literal("accept_attr_alias"), proposalId: id, note, canonical: z.string().min(1).max(40).optional() }),
  z.object({ action: z.literal("hide_attr_alias_reason"), proposalId: id, note: z.string().trim().min(1, "가리는 이유를 적어주세요.").max(300) }),
  z.object({ action: z.literal("reject_attr_alias"), proposalId: id, note: z.string().trim().min(1, "기각 사유를 적어주세요.").max(300) }),
  z.object({
    action: z.literal("remove_attr_alias"),
    categoryId: z.number().int().positive(),
    aliasKey: z.string().min(1).max(40),
    note: z.string().trim().min(1, "해제 사유를 적어주세요.").max(300),
  }),
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
    case "release_ai_hide":
      return json({ ok: true, ...(await releaseAiHide(input.kind, input.id, input.note)) });
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
    case "hide_rule_reason":
      await hideProposalReason(input.proposalId, input.note);
      return json({ ok: true });
    case "accept_brand_alias":
      return json({ ok: true, ...(await acceptProposal(input.proposalId, input.note, input.canonical)) });
    case "hide_brand_alias_reason":
      await hideBrandAliasReason(input.proposalId, input.note);
      return json({ ok: true });
    case "reject_brand_alias":
      await rejectProposal(input.proposalId, input.note);
      return json({ ok: true });
    case "remove_brand_alias":
      return json({ ok: true, ...(await removeAlias(input.aliasKey, input.note)) });
    case "accept_attr_alias": {
      const r = await attrAliases.acceptProposal(input.proposalId, input.note, input.canonical);
      clearFactCache();
      return json({ ok: true, ...r });
    }
    case "hide_attr_alias_reason":
      await attrAliases.hideProposalReason(input.proposalId, input.note);
      return json({ ok: true });
    case "reject_attr_alias":
      await attrAliases.rejectProposal(input.proposalId, input.note);
      return json({ ok: true });
    case "remove_attr_alias": {
      const r = await attrAliases.removeAlias(input.categoryId, input.aliasKey, input.note);
      clearFactCache();
      return json({ ok: true, ...r });
    }
  }
});
