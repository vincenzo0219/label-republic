import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { getSinglesAlert, setSinglesAlert } from "@/lib/repo/singlesEvents";
import { MAX_ALERT_AREAS } from "@/lib/singlesEvents";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  token: z.string().min(10).max(100),
  /** 없으면 지금 설정만 돌려준다. false 면 끄고 바로 지운다 */
  on: z.boolean().optional(),
  /** 켤 때: 동의문 판 (ALERT_CONSENT_VERSION) */
  consent: z.string().max(20).optional(),
  birthYear: z.number().int().min(1940).max(2020).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  areas: z.array(z.string().max(30)).max(MAX_ALERT_AREAS).optional(),
});

/** POST /api/push/singles: 💌 만남 행사 알림 (모집 시작·마감 하루 전). 동의한 조건만 저장 */
export const POST = route(async (req) => {
  if (!(await hit(`push:singles:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const b = await parseBody(req, schema);
  const alert = b.on === undefined ? await getSinglesAlert(b.endpoint, b.token) : await setSinglesAlert(b.endpoint, b.token, { on: b.on, consent: b.consent, birthYear: b.birthYear, gender: b.gender, areas: b.areas });
  return json({ alert });
});
