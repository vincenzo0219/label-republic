import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { isPredictRoom } from "@/lib/predictions";
import { hit } from "@/lib/rate-limit";
import { nameMyPicks, pickPrediction, predictCard } from "@/lib/repo/predictions";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/predictions?room=방&nick=닉네임 — 🎯 승부 예측 카드 (열린 문제·최근 결과·내 점수·이번 주 순위) */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const room = (sp.get("room") ?? "").slice(0, 60);
  if (!isPredictRoom(room)) return json(null);
  const vid = cookieOf(req);
  return json(await predictCard(room, vid ? visitorHash(vid) : null, sp.get("nick")?.slice(0, 20) || null));
});

const schema = z.union([
  z.object({ id: z.string().regex(/^\d{1,18}$/), choice: z.number().int().min(0).max(5), nickname: z.string().max(20).nullish() }),
  // 🏷 첫 선택 뒤 이름 남기기 (11/5): 이 방에서 이름 없이 고른 내 표에 닉네임을 붙인다
  z.object({ op: z.literal("name"), room: z.string().max(60), nickname: z.string().min(1).max(20) }),
]);

/** POST /api/predictions {id, choice, nickname?} — 마감 전 한 브라우저 한 표 */
export const POST = route(async (req) => {
  if (!(await hit(`predict:pick:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const input = await parseBody(req, schema);
  if ("op" in input) {
    if (!isPredictRoom(input.room)) return json(null);
    // 쿠키가 없으면 고른 표도 없다
    if (cookie) await nameMyPicks(input.room, visitorHash(cookie), input.nickname);
    return json(await predictCard(input.room, cookie ? visitorHash(cookie) : null, input.nickname.trim().slice(0, 20) || null));
  }
  const res = json(await pickPrediction({ ...input, visitor: visitorHash(vid), fp: fingerprint(req.headers) }));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
