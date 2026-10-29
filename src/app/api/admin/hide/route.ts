import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { HIDE_TYPES, operatorHide, operatorRestore, type HideType } from "@/lib/repo/opHide";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.object({
  type: z.enum(HIDE_TYPES as [HideType, ...HideType[]]),
  id: z.string().regex(/^\d{1,18}$/, "번호를 확인하세요."),
  action: z.enum(["hide", "restore"]),
  note: z.string().trim().max(300).default(""),
});

/** POST /api/admin/hide {type: post|comment|neo|gig|game, id, action: hide|restore, note?} — 🛠 운영자 가림·다시 보이기 (지우지 않음, 공개 기록) */
export const POST = route(async (req) => {
  const { type, id, action, note } = await parseBody(req, schema);
  if (action === "hide") {
    await operatorHide(type, id, note);
    return json({ ok: true, hidden: true });
  }
  const r = await operatorRestore(type, id, note);
  return json({ ok: true, hidden: r.stillBlinded });
});
