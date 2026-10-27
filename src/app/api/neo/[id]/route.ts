import { z } from "zod";
import { notFound, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { neoVisitor, withVisitor } from "@/lib/neoVisitor";
import { hit } from "@/lib/rate-limit";
import { deleteNeo, getNeo, reportNeo, setNeoOutcome, voteNeo } from "@/lib/repo/neo";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("vote"), choice: z.enum(["buy", "keep"]) }),
  z.object({ action: z.literal("outcome"), outcome: z.enum(["bought", "kept"]) }),
  z.object({ action: z.literal("report") }),
]);

const idOf = (id: string) => {
  if (!/^\d{1,18}$/.test(id)) throw notFound("넣어둬 글");
  return id;
};

/** GET /api/neo/:id */
export const GET = route<{ id: string }>(async (req, { id: raw }) => {
  const v = neoVisitor(req);
  const item = await getNeo(idOf(raw), v.hash);
  if (!item) throw notFound("넣어둬 글");
  return withVisitor(json({ item }), v.fresh);
});

/** POST /api/neo/:id {action: vote|outcome|report} */
export const POST = route<{ id: string }>(async (req, { id: raw }) => {
  if (!(await hit(`neo:act:${fingerprint(req.headers)}`, 120, 3600_000))) throw tooMany();
  const v = neoVisitor(req);
  const id = idOf(raw);
  const input = await parseBody(req, schema);
  if (input.action === "vote") return withVisitor(json({ item: await voteNeo(id, v.hash, input.choice) }), v.fresh);
  if (input.action === "outcome") return withVisitor(json({ item: await setNeoOutcome(id, v.hash, input.outcome) }), v.fresh);
  return withVisitor(json(await reportNeo(id, v.hash)), v.fresh);
});

/** DELETE /api/neo/:id — 내 글 지우기 */
export const DELETE = route<{ id: string }>(async (req, { id: raw }) => {
  const v = neoVisitor(req);
  await deleteNeo(idOf(raw), v.hash);
  return json({ ok: true });
});
