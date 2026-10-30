import { z } from "zod";
import { HttpError, tooMany } from "@/lib/errors";
import { isClickKey } from "@/lib/clicks";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { visitorOf, withVisitor } from "@/lib/pkHttp";
import { hit } from "@/lib/rate-limit";
import { recordClick } from "@/lib/repo/clicks";

const schema = z.object({ page: z.string().max(30), key: z.string().max(30) });

/** POST /api/metrics/click {page, key} — 페이지 버튼 클릭 한 번 (정해진 버튼만) */
export const POST = route(async (req) => {
  if (!(await hit(`click:${fingerprint(req.headers)}`, 300, 3600_000))) throw tooMany();
  const { page, key } = await parseBody(req, schema);
  if (!isClickKey(page, key)) throw new HttpError(400, "bad_click", "없는 버튼이에요");
  const v = visitorOf(req);
  await recordClick(page, key, v.hash);
  return withVisitor(json({ ok: true }), v);
});
