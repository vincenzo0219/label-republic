import { z } from "zod";
import { config } from "@/lib/config";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { boardOf } from "@/lib/roomBoards";
import * as repo from "@/lib/repo/roomBoards";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/room-board?b=판키: 🧩 놀이판 카드 (센 숫자만). ?rank=rally 는 🎾 랠리 탭 이번 주 순위 */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const vid = cookieOf(req);
  const visitor = vid ? visitorHash(vid) : null;
  if (sp.get("rank") === "rally") return json({ rows: await repo.rallyWeekRank(visitor) });
  const key = sp.get("b");
  if (!boardOf(key)) return json(null);
  return json(await repo.boardCard(key!, visitor));
});

const id = z.string().regex(/^\d{1,18}$/);
const nickname = z.string().max(20).nullish();
const schema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("log"), b: z.string().max(30), value: z.number().nullish(), label: z.string().max(40).nullish(), nickname }),
  z.object({ op: z.literal("unlog"), b: z.string().max(30), label: z.string().max(40) }),
  z.object({ op: z.literal("photo"), b: z.string().max(30), image: z.object({ id: z.string().uuid(), token: z.string().max(64) }), nickname }),
  z.object({ op: z.literal("heart"), b: z.string().max(30), id }),
  z.object({ op: z.literal("unphoto"), b: z.string().max(30), id }),
  z.object({ op: z.literal("ask"), b: z.string().max(30), title: z.string().max(60), price: z.number().nullish(), nickname }),
  z.object({ op: z.literal("vote"), b: z.string().max(30), id, choice: z.boolean() }),
  z.object({ op: z.literal("unask"), b: z.string().max(30), id }),
  z.object({ op: z.literal("pick"), b: z.string().max(30), choice: z.string().max(30) }),
  z.object({ op: z.literal("rate"), b: z.string().max(30), label: z.string().max(40), score: z.number().int(), nickname }),
  z.object({ op: z.literal("unrate"), b: z.string().max(30), label: z.string().max(40) }),
  z.object({ op: z.literal("pet"), b: z.string().max(30), name: z.string().max(20), kind: z.string().max(10), month: z.number().int(), day: z.number().int(), nickname }),
  z.object({ op: z.literal("unpet"), b: z.string().max(30), id }),
  z.object({ op: z.literal("cheer"), b: z.string().max(30), id }),
  z.object({ op: z.literal("report"), b: z.string().max(30), kind: z.enum(["photo", "vote", "pet"]), id }),
]);

/** 글을 새로 만드는 동작은 더 좁게 */
const CREATE_OPS = new Set(["photo", "ask", "pet", "rate", "log"]);

/** POST /api/room-board {op, b, ...}: 🧩 놀이판 쓰기 (익명 방문자 쿠키) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`room-board:${fp}`, 120, 3600_000))) throw tooMany();
  const input = await parseBody(req, schema);
  if (!boardOf(input.b)) throw new HttpError(404, "not_found", "놀이판을 찾을 수 없어요.");
  if (CREATE_OPS.has(input.op) && !(await hit(`room-board:new:${fp}`, 40, 3600_000))) throw tooMany();
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const v = visitorHash(vid);
  const b = input.b;
  let out: unknown;
  switch (input.op) {
    case "log": out = await repo.addLog(b, v, input); break;
    case "unlog": out = await repo.removeLog(b, v, input.label); break;
    case "photo": out = await repo.addPhoto(b, v, { image: input.image, nickname: input.nickname }); break;
    case "heart": out = await repo.heartPhoto(b, input.id, v); break;
    case "unphoto": out = await repo.deletePhoto(b, input.id, v); break;
    case "ask": out = await repo.createVote(b, v, { title: input.title, price: input.price, nickname: input.nickname, fingerprint: fp }); break;
    case "vote": out = await repo.castVote(b, input.id, v, input.choice); break;
    case "unask": out = await repo.deleteVote(b, input.id, v); break;
    case "pick": out = await repo.pick(b, v, input.choice); break;
    case "rate": out = await repo.rate(b, v, input); break;
    case "unrate": out = await repo.unrate(b, v, input.label); break;
    case "pet": out = await repo.addPet(b, v, input); break;
    case "unpet": out = await repo.deletePet(b, input.id, v); break;
    case "cheer": out = await repo.cheerPet(b, input.id, v); break;
    case "report":
      await repo.reportItem(input.kind, input.id, v);
      out = await repo.boardCard(b, v);
      break;
  }
  const res = json(out);
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
