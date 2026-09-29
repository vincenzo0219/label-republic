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
/**
 * 같은 망 + 같은 브라우저 종류로 사람을 좁히는 것은 그 조합을 쓴 사람이 적을 때만 (Sprint 38).
 * 통신사 망(CGNAT)은 한 대역을 수많은 사람이 나눠 쓰고, 안드로이드 Chrome·iPhone Safari 는 기기가 달라도
 * 브라우저 문자열이 같아서 — 한 사람의 블라인드로 같은 통신사·같은 브라우저를 쓰는 모두가 막힐 수 있다.
 * 최근 30일 그 조합에서 글을 쓴 식별값이 이보다 많으면 여러 사람이 쓰는 망으로 보고 같은 식별값만 센다.
 */
export const SHARED_NETWORK_WRITERS = 10;

export type WriteLimit = { blinds: number; until: string };

type Db = Pick<PoolClient, "query"> | null;
async function rows<T extends object>(client: Db, sql: string, args: unknown[]): Promise<T[]> {
  return client ? (await client.query<T>(sql, args)).rows : query<T>(sql, args);
}

/** 지금 쓰기가 제한돼 있으면 제한 정보, 아니면 null */
export async function writeLimit(who: { fingerprint: string; net: string | null; agent: string | null }, client: Db = null): Promise<WriteLimit | null> {
  const rules = await getRules();
  const need = rules.write_limit_blinds;
  const days = rules.write_limit_days;
  const net = who.net && who.agent ? who.net : null;
  // 최근 블라인드를 같은 식별값 것과 같은 망·브라우저 종류 것으로 나눠 센다 (부분 인덱스 두 개를 탐)
  const [r] = await rows<{ fp: number; fp_last: string | null; all: number; all_last: string | null }>(
    client,
    `SELECT count(*) FILTER (WHERE author_fingerprint = $1)::int AS fp,
            max(blinded_at) FILTER (WHERE author_fingerprint = $1) AS fp_last,
            count(*)::int AS all, max(blinded_at) AS all_last
       FROM posts
      WHERE is_blinded AND NOT legal_hold AND blinded_at > now() - make_interval(days => $4)
        AND (author_fingerprint = $1 OR ($2::text IS NOT NULL AND author_net = $2 AND author_agent = $3))`,
    [who.fingerprint, net, who.agent, WRITE_LIMIT_WINDOW_DAYS],
  );
  let blinds = r!.fp;
  let last = r!.fp_last;
  if (blinds < need && r!.all >= need && net) {
    // 망까지 넣어야 기준에 닿을 때만: 그 망·브라우저 종류를 쓰는 사람이 적은지 본다
    const [crowd] = await rows<{ n: number }>(
      client,
      `SELECT count(*)::int AS n FROM (
         SELECT DISTINCT author_fingerprint FROM posts
          WHERE author_net = $1 AND author_agent = $2 AND created_at > now() - make_interval(days => $3) AND author_fingerprint IS NOT NULL
          LIMIT $4) x`,
      [net, who.agent, WRITE_LIMIT_WINDOW_DAYS, SHARED_NETWORK_WRITERS + 1],
    );
    if (crowd!.n <= SHARED_NETWORK_WRITERS) {
      blinds = r!.all;
      last = r!.all_last;
    }
  }
  if (blinds < need || !last) return null;
  const until = new Date(new Date(last).getTime() + days * 86_400_000);
  if (until.getTime() <= Date.now()) return null;
  return { blinds, until: until.toISOString() };
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
