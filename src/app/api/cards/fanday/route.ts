import { z } from "zod";
import { HttpError, tooMany } from "@/lib/errors";
import { FAN_PRESETS } from "@/lib/fanDays";
import { agentHash, fingerprint, networkHash } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { kstDay } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { cardRoom, createFanCard } from "@/lib/repo/cards";
import { claimNickname } from "@/lib/repo/nicknames";
import { assertCanWrite } from "@/lib/repo/write-limits";
import { nickname, pin } from "@/lib/validation";

const schema = z.object({
  room: z.string().min(1).max(60),
  preset: z.enum(FAN_PRESETS.map((p) => p.key) as [string, ...string[]]),
  occasion: z.discriminatedUnion("unit", [
    z.object({ unit: z.literal("days"), n: z.number().int().min(1).max(40000) }),
    z.object({ unit: z.literal("bday") }),
    z.object({ unit: z.literal("until"), n: z.number().int().min(1).max(366) }),
  ]),
  nickname,
  pw: pin,
});

/**
 * POST /api/cards/fanday — 🎉 덕질 기념일 카드 (10/26). 고른 것만 받고 제목·본문은 서버가 정해진 틀로 만든다 (날짜는 받지 않음).
 * 한 기기·한 방에 하루 한 장. 닉네임은 글과 같은 규칙(운영자 사칭 금지·욕설 거르기)을 거친다.
 */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  const net = networkHash(req.headers);
  const input = await parseBody(req, schema);
  await claimNickname(input.nickname, input.pw);
  await assertCanWrite({ fingerprint: fp, net, agent: agentHash(req.headers) });
  await cardRoom(input.room);
  if (!(await hit(`fancard:${fp}:${input.room}:${kstDay()}`, 1, 24 * 3600_000)))
    throw new HttpError(429, "rate_limited", "이 방에는 오늘 카드를 이미 올렸어요. 내일 다시 올릴 수 있어요.");
  if (!(await hit(`fancard-net:${net}`, 20, 24 * 3600_000))) throw tooMany();
  const card = await createFanCard({
    room: input.room,
    preset: input.preset as (typeof FAN_PRESETS)[number]["key"],
    occasion: input.occasion,
    nickname: input.nickname,
    pin: input.pw,
    fingerprint: fp,
    network: net,
    agent: agentHash(req.headers),
  });
  return json({ card }, 201);
});
