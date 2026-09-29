/**
 * 자동 쓰기 제한 (Sprint 37) — 강퇴 대신.
 *
 * 같은 브라우저(식별값), 또는 같은 망 + 같은 브라우저 종류에서 쓴 글이 최근 30일 안에 이용자 신고로
 * N번(규칙 write_limit_blinds) 블라인드되면, 마지막 블라인드부터 D일(규칙 write_limit_days) 동안 쓸 수 없다.
 * 운영자가 정하지 않고, 제한 목록도 저장하지 않는다 — 조작 신고가 무효화돼 블라인드가 풀리면 제한도 풀린다.
 * 한계: 망과 브라우저를 모두 바꾸면 피할 수 있다 (계정이 없는 구조의 한계, 운영 원칙에 공개).
 */
import type { PoolClient } from "pg";
import { query } from "../db";
import { HttpError } from "../errors";
import { getRules } from "./rules";

export const WRITE_LIMIT_WINDOW_DAYS = 30;

export type WriteLimit = { blinds: number; until: string };

/** 지금 쓰기가 제한돼 있으면 제한 정보, 아니면 null */
export async function writeLimit(who: { fingerprint: string; net: string | null; agent: string | null }, client: Pick<PoolClient, "query"> | null = null): Promise<WriteLimit | null> {
  const rules = await getRules();
  const need = rules.write_limit_blinds;
  const days = rules.write_limit_days;
  const sql = `SELECT count(*)::int AS blinds, max(blinded_at) AS last
                 FROM posts
                WHERE is_blinded AND NOT legal_hold AND blinded_at > now() - make_interval(days => $4)
                  AND (author_fingerprint = $1 OR ($2::text IS NOT NULL AND $3::text IS NOT NULL AND author_net = $2 AND author_agent = $3))`;
  const args = [who.fingerprint, who.net, who.agent, WRITE_LIMIT_WINDOW_DAYS];
  const rows = client ? (await client.query<{ blinds: number; last: string | null }>(sql, args)).rows : await query<{ blinds: number; last: string | null }>(sql, args);
  const r = rows[0]!;
  if (r.blinds < need || !r.last) return null;
  const until = new Date(new Date(r.last).getTime() + days * 86_400_000);
  if (until.getTime() <= Date.now()) return null;
  return { blinds: r.blinds, until: until.toISOString() };
}

/** 쓰기 API 앞에서: 제한 중이면 403 과 풀리는 시각 */
export async function assertCanWrite(who: { fingerprint: string; net: string | null; agent: string | null }): Promise<void> {
  const limit = await writeLimit(who);
  if (!limit) return;
  const when = new Date(limit.until).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  throw new HttpError(
    403,
    "write_limited",
    `최근 ${WRITE_LIMIT_WINDOW_DAYS}일 동안 여기서 쓴 글이 이용자 신고로 ${limit.blinds}번 블라인드되어 ${when}까지 글·댓글을 쓸 수 없어요. 블라인드가 억울하면 그 글에서 재검토를 요청할 수 있어요.`,
  );
}
