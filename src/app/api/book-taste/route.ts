import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { bookTasteBoard, saveBookTaste } from "@/lib/repo/typeTests";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/book-taste — 📚 행사 책 취향 테이블 (응답 5명 이상일 때만 TOP 5·대화 주제) */
export const GET = route(async (req) => {
  const vid = cookieOf(req);
  return json(await bookTasteBoard(vid ? visitorHash(vid) : null));
});

/** POST /api/book-taste {picks: 키[] (1~3)} — 한 브라우저 한 표, 다시 보내면 바뀐다 */
export const POST = route(async (req) => {
  if (!(await hit(`book-taste:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const input = await parseBody(req, z.object({ picks: z.array(z.string().max(20)).min(1).max(3) }));
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const res = json(await saveBookTaste(visitorHash(vid), input.picks));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
