import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { createAppeal, getAppeal } from "@/lib/repo/operator";
import { pin } from "@/lib/validation";

const schema = z.object({
  pw: pin,
  // 운영자만 봅니다 (공개하지 않음)
  message: z.string().trim().max(500).default(""),
});

/** GET /api/posts/:id/appeal — 재검토 요청 상태 (공개) */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  return json({ appeal: await getAppeal(id) });
});

/** POST /api/posts/:id/appeal — 작성자가 블라인드·광고 의심 글의 재검토를 요청 (글당 한 번) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`appeal:${fp}`, 5, 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, schema);
  return json({ appeal: await createAppeal(id, fp, input.pw, input.message) }, 201);
});
