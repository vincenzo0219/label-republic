import { after } from "next/server";
import { sendAlert } from "@/lib/error-tracking";
import { tooMany } from "@/lib/errors";
import { cleanPath, FEEDBACK_KINDS, type FeedbackEnv } from "@/lib/feedback";
import { fingerprint, networkHash } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { createFeedback, listPublic, type FeedbackFilter } from "@/lib/repo/feedback";
import { feedbackSchema } from "@/lib/validation";

/** GET /api/feedback?filter=open|closed|all&page= — 공개 현황판 */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const f = sp.get("filter");
  const filter: FeedbackFilter = f === "closed" || f === "all" ? f : "open";
  return json(await listPublic(filter, Number(sp.get("page")) || 1, fingerprint(req.headers)));
});

/** POST /api/feedback {kind, title, body, pagePath?, env?} — 제보 (Sprint 36). 쓴 브라우저에 "번호.증표"를 돌려준다 */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  const net = networkHash(req.headers);
  if (!(await hit(`feedback:${fp}`, 5, 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, feedbackSchema);
  // 사람에게 보이지 않는 칸이 채워졌으면 자동 제출 — 받은 것처럼 답하고 저장하지 않는다
  if (input.website) return json({ id: "0", ref: "" }, 201);
  const pagePath = cleanPath(input.pagePath);
  const created = await createFeedback({ ...input, pagePath, env: (input.env ?? null) as FeedbackEnv | null, fingerprint: fp, net });
  // 고장 제보는 운영자에게 바로 알린다 (알림 웹훅은 시간당 10건까지 — 오류 알림과 함께 셈)
  if (input.kind === "bug") {
    after(() => sendAlert(`🛠 새 제보 #${created.id} ${FEEDBACK_KINDS.bug} ${input.title}${pagePath ? ` — ${pagePath}` : ""}`).then(() => {}));
  }
  return json(created, 201);
});
