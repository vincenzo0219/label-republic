import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { KOSPI_ROOMS } from "@/lib/kospiGame";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { kospiCard, pickKospi } from "@/lib/repo/kospi";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/kospi?slug=방 — 📈 코스피 맞히기 카드 (투자방 3곳만, 10/29) */
export const GET = route(async (req) => {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!KOSPI_ROOMS.has(slug)) return json(null);
  const vid = cookieOf(req);
  return json(await kospiCard(vid ? visitorHash(vid) : null));
});

const schema = z.object({ slug: z.string().min(1).max(60), side: z.union([z.literal(1), z.literal(-1)]), nickname: z.string().max(20).nullish() });

/** POST /api/kospi {slug, side: 1|-1, nickname?} — 지금 문제에 📈/📉 하나. 한 브라우저 하루 한 번 */
export const POST = route(async (req) => {
  if (!(await hit(`kospi:pick:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const { slug, side, nickname } = await parseBody(req, schema);
  const res = json(await pickKospi({ visitor: visitorHash(vid), fp: fingerprint(req.headers), nickname, room: slug, side }));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
