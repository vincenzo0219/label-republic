import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { approveDraft, createDraft, discardDraft } from "@/lib/repo/drafts";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const id = z.string().regex(/^\d{1,18}$/, "번호를 확인하세요.");
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    kind: z.enum(["post", "comment", "threads", "instagram"]),
    categorySlug: z.string().min(1).max(60).optional(),
    postId: id.optional(),
    parentId: id.optional(),
    nickname: z.string().trim().min(1).max(20).optional(),
    pin: z.string().regex(/^\d{4}$/).optional(),
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().min(2).max(20000),
    extra: z.string().trim().max(2000).optional(),
    note: z.string().trim().max(1000).optional(),
    imageUrl: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("approve"),
    id,
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().max(20000).optional(),
    /** 스레드·인스타를 직접 올렸을 때 — 서버는 올리지 않고 표시만 */
    manual: z.boolean().optional(),
  }),
  z.object({ action: z.literal("discard"), id }),
]);

/** POST /api/admin/drafts — 초안 넣기(create) · 승인(approve) · 버리기(discard) */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  if (input.action === "create") {
    const { action: _a, ...rest } = input;
    return json({ draft: await createDraft(rest) });
  }
  if (input.action === "approve") return json({ draft: await approveDraft(input.id, { title: input.title, body: input.body, manual: input.manual }) });
  await discardDraft(input.id);
  return json({ ok: true });
});
