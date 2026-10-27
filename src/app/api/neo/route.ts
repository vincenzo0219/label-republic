import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { neoVisitor, withVisitor } from "@/lib/neoVisitor";
import { hit } from "@/lib/rate-limit";
import { createNeo, listNeo, neoSaved } from "@/lib/repo/neo";

const schema = z.object({
  title: z.string().trim().min(2, "물건 이름을 2자 이상 적어 주세요.").max(40, "물건 이름은 40자까지예요."),
  price: z.number().int().min(1000, "가격은 1,000원 이상으로 적어 주세요.").max(50_000_000, "가격이 너무 커요."),
  reason: z.string().trim().max(120, "이유는 120자까지예요.").default(""),
});

/** GET /api/neo — 💳 넣어둬 목록 (진행 중·최근 마감) + 지킨 돈 */
export const GET = route(async (req) => {
  const v = neoVisitor(req);
  const [list, saved] = await Promise.all([listNeo(v.hash), neoSaved()]);
  return withVisitor(json({ ...list, saved }), v.fresh);
});

/** POST /api/neo {title, price, reason} — 살까 말까 올리기 (익명, 24시간 투표) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`neo:post:${fp}`, 10, 3600_000))) throw tooMany();
  const v = neoVisitor(req);
  const input = await parseBody(req, schema);
  const item = await createNeo({ ...input, owner: v.hash, fingerprint: fp });
  return withVisitor(json({ item }, 201), v.fresh);
});
