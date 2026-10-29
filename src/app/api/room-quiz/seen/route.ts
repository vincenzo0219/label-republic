import { z } from "zod";
import { isBot, kstDay, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { seeQuiz } from "@/lib/repo/roomQuizzes";

const schema = z.object({ slug: z.string().regex(/^[\p{L}\p{N}-]{1,60}$/u) });

/** POST /api/room-quiz/seen {slug} — 🧩 퀴즈 카드가 화면에 보였다 (응답률 분모). 방문자 쿠키가 있을 때만, 늘 204 */
export async function POST(req: Request) {
  const res = new Response(null, { status: 204 });
  try {
    if (isBot(req.headers.get("user-agent"))) return res;
    const vid = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
    if (!vid) return res;
    const parsed = schema.safeParse(JSON.parse(await req.text()));
    if (!parsed.success) return res;
    const vh = visitorHash(vid);
    if (!(await hit(`quiz:seen:${vh}`, 60, 60 * 1000))) return res;
    await seeQuiz(parsed.data.slug, kstDay(), vh);
  } catch {}
  return res;
}
