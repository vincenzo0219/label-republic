import { z } from "zod";
import { reportError } from "@/lib/error-tracking";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";

const schema = z.object({
  message: z.string().max(500),
  source: z.string().max(300).default(""),
  path: z.string().max(300).default(""),
  digest: z.string().max(40).default(""),
});

/**
 * POST /api/errors — 브라우저 오류 보고 (화면 깨짐·스크립트 오류). 개인정보가 섞이지 않게 메시지·스크립트 위치·경로만 받는다.
 * 브라우저 확장 프로그램 등 사이트와 무관한 오류가 많아 한 사람당 시간당 20건까지만 받고, 넘으면 조용히 버린다.
 */
export const POST = route(async (req) => {
  if (!(await hit(`client-error:${fingerprint(req.headers)}`, 20, 60 * 60 * 1000))) return json({ ok: true });
  const e = await parseBody(req, schema);
  // 다른 사이트 스크립트·확장 프로그램 오류는 버린다
  if (e.source && !/^\/_next\/|^\/sw\.js/.test(e.source.replace(/^https?:\/\/[^/]+/, ""))) return json({ ok: true });
  const err = new Error(e.message || "(메시지 없음)");
  err.name = "ClientError";
  err.stack = `ClientError: ${e.message}\n    at ${e.source.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "")}${e.digest ? ` (digest ${e.digest})` : ""}`;
  reportError(err, { kind: "client", path: e.path });
  return json({ ok: true });
});
