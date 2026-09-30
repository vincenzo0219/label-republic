/**
 * Idempotency-Key 처리 (Sprint 19, 서버 전용).
 *
 * 느린 망에서 "등록"을 눌렀는데 응답을 못 받으면, 사용자는 글이 올라갔는지 알 수 없다. 브라우저가 같은 키로 다시 보내면
 * 처음 결과를 그대로 돌려줘 두 번 올라가지 않게 한다. 키가 없으면 평소처럼 처리한다.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "./db";
import { HttpError } from "./errors";

const KEY = /^[A-Za-z0-9-]{16,64}$/;

/**
 * 같은 키는 "같은 내용"에만 결과를 돌려준다. 사람(IP·브라우저)이 아니라 요청 본문으로 비교하는 이유:
 * 휴대폰은 와이파이→LTE 로 바뀌며 IP 가 달라지는데, 그때 다시 보낸 요청도 같은 글로 알아봐야 한다.
 * 키는 브라우저가 만든 무작위 값(UUID)이라 남이 알 수 없다.
 */
export async function withIdempotency(req: Request, scope: string, fn: () => Promise<Response>): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  if (!key) return fn();
  if (!KEY.test(key)) throw new HttpError(400, "invalid_idempotency_key", "요청 키 형식이 올바르지 않습니다.");
  const bodyHash = createHash("sha256").update(await req.clone().text()).digest("hex");
  const claimed = await query<{ key: string }>(
    "INSERT INTO idempotency_keys (key, scope, body_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING key",
    [key, scope, bodyHash],
  );
  if (!claimed[0]) {
    const rows = await query<{ scope: string; body_hash: string; status: number | null; response: unknown }>(
      "SELECT scope, body_hash, status, response FROM idempotency_keys WHERE key = $1",
      [key],
    );
    const r = rows[0];
    // 내용이 바뀌었거나 다른 종류의 요청이면 처음 결과를 보여주지 않는다 (고쳐 쓴 글은 새 키로 보내야 한다)
    if (!r || r.body_hash !== bodyHash || r.scope !== scope) throw new HttpError(409, "idempotency_conflict", "요청 키가 겹쳤습니다. 새로고침 후 다시 시도해 주세요.");
    if (r.status === null) {
      // 처리 중에 서버가 재시작되면 "처리 중"으로 남는다 → 2분이 지났으면 이어받아 다시 처리
      const retaken = await query(
        "UPDATE idempotency_keys SET created_at = now() WHERE key = $1 AND status IS NULL AND created_at < now() - interval '2 minutes' RETURNING key",
        [key],
      );
      if (!retaken[0]) throw new HttpError(409, "in_progress", "같은 요청을 처리하고 있어요. 잠시 후 다시 확인해 주세요.");
    } else {
      return NextResponse.json(r.response, { status: r.status, headers: { "Cache-Control": "no-store", "Idempotent-Replay": "true" } });
    }
  }
  let res: Response;
  try {
    res = await fn();
  } catch (err) {
    // 실패(검증 오류 포함)는 결과로 남기지 않는다 — 고쳐서 같은 키로 다시 보낼 수 있게
    await query("DELETE FROM idempotency_keys WHERE key = $1", [key]).catch(() => {});
    throw err;
  }
  if (res.status >= 200 && res.status < 300) {
    const body = await res.clone().json().catch(() => null);
    await query("UPDATE idempotency_keys SET status = $2, response = $3 WHERE key = $1", [key, res.status, JSON.stringify(body)]);
  } else {
    await query("DELETE FROM idempotency_keys WHERE key = $1", [key]).catch(() => {});
  }
  return res;
}
