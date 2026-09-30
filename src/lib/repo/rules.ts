/**
 * 커뮤니티 규칙 값 읽기와 규칙 투표 (Sprint 21).
 *
 * - 규칙 값은 인스턴스별로 30초 캐시한다 (투표 결과가 모든 워커에 반영되기까지 최대 30초).
 *   DB 트리거(블라인드 신고 수)는 rule_value() 로 매번 직접 읽는다.
 * - 운영자는 규칙 값을 바꿀 수 없다. 권리침해가 있는 제안 사유만 가릴 수 있고 그 조치는 공개 기록에 남는다.
 */
import type { PoolClient } from "pg";
import { config } from "../config";
import { query, tx } from "../db";
import { HttpError } from "../errors";
import { hashPin } from "../password";
import {
  COOLDOWN_DAYS,
  FRESH_AGE_DAYS,
  FRESH_MAX_CONTRIBUTIONS,
  FRESH_MIN_SHARE,
  FRESH_MIN_VOTES,
  HOLD_HOURS,
  NET_MIN_VOTES,
  NET_YOUNG_DAYS,
  ELIGIBLE_AGE_DAYS,
  isRuleKey,
  MIN_CONTRIBUTIONS,
  proposalProblem,
  quorumFor,
  RULE_KEYS,
  RULES,
  tally,
  voteWeight,
  VOTING_DAYS,
  type Eligibility,
  type RuleKey,
  type RuleValues,
} from "../rules";
import { assertPin } from "./pin-guard";

// ---------------------------------------------------------------------------
// 규칙 값
// ---------------------------------------------------------------------------

const TTL_MS = 30_000;
const g = globalThis as unknown as { __labelRepRules?: { at: number; values: RuleValues } };

function defaults(): RuleValues {
  const out = {} as RuleValues;
  for (const k of RULE_KEYS) out[k] = RULES[k].defaultValue;
  // 투표로 바뀐 적이 없으면 운영 설정(환경변수)을 따른다
  out.board_promotion_votes = config.boardPromotionThreshold;
  return out;
}

export async function getRules(): Promise<RuleValues> {
  const cached = g.__labelRepRules;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.values;
  const values = defaults();
  const rows = await query<{ key: string; value: number | null }>("SELECT key, value::float8 AS value FROM community_rules");
  for (const r of rows) if (isRuleKey(r.key) && r.value !== null) values[r.key] = r.value;
  g.__labelRepRules = { at: Date.now(), values };
  return values;
}

export async function getRule(key: RuleKey): Promise<number> {
  return (await getRules())[key];
}

export function invalidateRules() {
  g.__labelRepRules = undefined;
}

// ---------------------------------------------------------------------------
// 투표 자격
// ---------------------------------------------------------------------------

/** 글·댓글·정정 제안 수 (블라인드된 글은 빼고). $2 보다 먼저 쓴 것만 센다 (Sprint 29) */
const CONTRIBUTIONS = `
  (SELECT count(*) FROM posts WHERE author_fingerprint = $1 AND NOT is_blinded AND created_at < $2)
  + (SELECT count(*) FROM comments WHERE author_fingerprint = $1 AND created_at < $2)
  + (SELECT count(*) FROM corrections WHERE author_fingerprint = $1 AND created_at < $2)`;

/**
 * 한 제안에 같은 접속 망에서 낼 수 있는 표 (Sprint 29 — 브라우저만 바꿔 계정을 여럿 만드는 방식 차단).
 * 통신사·회사 망을 함께 쓰는 오래된 회원까지 막지 않도록, 계정 나이 NET_CAP_EXEMPT_AGE_DAYS 일 이상이면 적용하지 않는다
 * (조작하려면 계정을 석 달 넘게 묵혀야 한다).
 */
export const NET_VOTES_PER_PROPOSAL = 3;
export const NET_CAP_EXEMPT_AGE_DAYS = 90;

export type VoterStatus = Eligibility & { ageDays: number; contributions: number };

/**
 * before: 이 시각보다 먼저 한 기여만 센다 — 투표할 때는 제안이 올라온 시각. 제안을 보고 나서 댓글을 몰아 써
 * 자격을 채우는 것을 막는다 (Sprint 29 보안 재점검)
 */
export async function voterStatus(fp: string, client?: PoolClient, before?: string): Promise<VoterStatus> {
  const sql = `SELECT extract(epoch FROM now() - f.first_seen)::float8 / 86400 AS age, (${CONTRIBUTIONS})::int AS n
                 FROM (SELECT $1::char(64) AS fp) x LEFT JOIN fingerprints f ON f.fingerprint = x.fp`;
  const args = [fp, before ?? "infinity"];
  const rows = client ? (await client.query<{ age: number | null; n: number }>(sql, args)).rows : await query<{ age: number | null; n: number }>(sql, args);
  const ageDays = rows[0]?.age ?? 0;
  const contributions = rows[0]?.n ?? 0;
  return { ...voteWeight(ageDays, contributions), ageDays, contributions };
}

/** 최근 30일 활동한 이용자 중 투표 자격이 있는 수 — 정족수 계산용 */
async function eligibleVoters(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `WITH c AS (
       SELECT author_fingerprint AS fp FROM posts WHERE author_fingerprint IS NOT NULL AND NOT is_blinded
       UNION ALL SELECT author_fingerprint FROM comments WHERE author_fingerprint IS NOT NULL
       UNION ALL SELECT author_fingerprint FROM corrections WHERE author_fingerprint IS NOT NULL
     ), counted AS (SELECT fp FROM c GROUP BY fp HAVING count(*) >= $1)
     SELECT count(*)::int AS n FROM counted JOIN fingerprints f ON f.fingerprint = counted.fp
      WHERE f.first_seen <= now() - make_interval(days => $2) AND f.last_seen >= now() - interval '30 days'`,
    [MIN_CONTRIBUTIONS, ELIGIBLE_AGE_DAYS],
  );
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// 제안
// ---------------------------------------------------------------------------

export type ProposalStatus = "open" | "passed" | "rejected" | "withdrawn";
export type Proposal = {
  id: string;
  rule_key: RuleKey;
  from_value: number;
  to_value: number;
  reason: string;
  reason_hidden: boolean;
  nickname: string;
  quorum: number;
  status: ProposalStatus;
  result_note: string;
  yes_weight: number;
  no_weight: number;
  voter_count: number;
  created_at: string;
  closes_at: string;
  closed_at: string | null;
};

const PROPOSAL_COLS = `id::text, rule_key, from_value::float8 AS from_value, to_value::float8 AS to_value,
  CASE WHEN reason_hidden_at IS NULL THEN reason ELSE '' END AS reason, reason_hidden_at IS NOT NULL AS reason_hidden,
  nickname, quorum::float8 AS quorum, status, result_note, yes_weight::float8 AS yes_weight, no_weight::float8 AS no_weight,
  voter_count, created_at, closes_at, closed_at`;

function reasonProblem(reason: string): string | null {
  if (/https?:\/\/|www\./i.test(reason)) return "제안 이유에는 링크를 넣을 수 없어요. 근거가 되는 글은 글 번호(#123)로 적어주세요.";
  if (/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|카톡|오픈\s*채팅|텔레그램/.test(reason)) return "제안 이유에는 연락처를 넣을 수 없어요.";
  return null;
}

/** netHash: 망 식별값 (조작 탐지용, Sprint 23) */
export type ProposalInput = { key: RuleKey; value: number; reason: string; nickname: string; pin: string; fingerprint: string; netHash?: string };

export async function createProposal(input: ProposalInput): Promise<Proposal> {
  const problem = reasonProblem(input.reason);
  if (problem) throw new HttpError(400, "invalid_input", problem);
  const pwHash = await hashPin(input.pin);
  const id = await tx(async (client) => {
    const status = await voterStatus(input.fingerprint, client);
    if (!status.weight) throw new HttpError(403, "not_eligible", `규칙 변경을 제안할 수 없어요. ${status.reason}`);
    // 같은 규칙에 대한 동시 제안을 한 줄로 세운다. 한 사람이 여러 규칙에 동시에 내는 것도 (일주일 한 번 확인이 규칙별로만 잠기던 문제)
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`rule-proposer:${input.fingerprint}`]);
    await client.query("SELECT key FROM community_rules WHERE key = $1 FOR UPDATE", [input.key]);
    const open = await client.query("SELECT id FROM rule_proposals WHERE rule_key = $1 AND status = 'open'", [input.key]);
    if (open.rows[0]) throw new HttpError(409, "proposal_open", "이 규칙은 이미 투표가 진행 중이에요. 그 투표에 참여해주세요.");
    const recent = await client.query<{ closed_at: string }>(
      // 표를 받은 뒤 철회한 제안도 결정된 것으로 본다 — 질 것 같으면 철회하고 곧바로 다시 내는 것을 막는다 (Sprint 29)
      `SELECT closed_at FROM rule_proposals WHERE rule_key = $1
          AND (status IN ('passed', 'rejected') OR (status = 'withdrawn' AND voter_count > 1))
          AND closed_at > now() - make_interval(days => $2) ORDER BY closed_at DESC LIMIT 1`,
      [input.key, COOLDOWN_DAYS],
    );
    if (recent.rows[0]) {
      throw new HttpError(409, "cooldown", `이 규칙은 최근 투표로 결정됐어요. 결정 후 ${COOLDOWN_DAYS}일이 지나야 다시 제안할 수 있어요.`);
    }
    const mine = await client.query("SELECT 1 FROM rule_proposals WHERE proposer_fingerprint = $1 AND created_at > now() - interval '7 days'", [input.fingerprint]);
    if (mine.rows[0]) throw new HttpError(429, "rate_limited", "규칙 변경 제안은 일주일에 한 번까지 할 수 있어요.");
    const current = (await getRulesFresh(client))[input.key];
    const bad = proposalProblem(input.key, current, input.value);
    if (bad) throw new HttpError(400, "invalid_value", bad);
    const quorum = quorumFor(await eligibleVoters(client));
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO rule_proposals (rule_key, from_value, to_value, reason, nickname, pw_hash, proposer_fingerprint, quorum, closes_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(days => $9)) RETURNING id::text`,
      [input.key, current, input.value, input.reason, input.nickname, pwHash, input.fingerprint, quorum, VOTING_DAYS],
    );
    const proposalId = rows[0]!.id;
    // 제안한 사람은 찬성으로 센다
    await client.query(
      `INSERT INTO rule_votes (proposal_id, fingerprint, value, weight, voter_age_days, voter_contributions, net_hash) VALUES ($1, $2, 1, $3, $4, $5, $6)`,
      [proposalId, input.fingerprint, status.weight, round1(status.ageDays), status.contributions, input.netHash ?? null],
    );
    await refreshTally(client, proposalId);
    return proposalId;
  });
  return (await getProposal(id))!;
}

/** 캐시를 거치지 않고 (트랜잭션 안에서) */
async function getRulesFresh(client: PoolClient): Promise<RuleValues> {
  const values = defaults();
  const { rows } = await client.query<{ key: string; value: number | null }>("SELECT key, value::float8 AS value FROM community_rules");
  for (const r of rows) if (isRuleKey(r.key) && r.value !== null) values[r.key] = r.value;
  return values;
}

async function refreshTally(client: PoolClient, proposalId: string) {
  await client.query(
    `UPDATE rule_proposals p SET
       yes_weight  = coalesce((SELECT sum(weight) FROM rule_votes WHERE proposal_id = p.id AND value = 1 AND voided_at IS NULL), 0),
       no_weight   = coalesce((SELECT sum(weight) FROM rule_votes WHERE proposal_id = p.id AND value = -1 AND voided_at IS NULL), 0),
       voter_count = (SELECT count(*) FROM rule_votes WHERE proposal_id = p.id AND voided_at IS NULL AND value <> 0)
     WHERE id = $1`,
    [proposalId],
  );
}

const ID = /^\d{1,18}$/;
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function getProposal(id: string): Promise<Proposal | null> {
  if (!ID.test(id)) return null;
  const rows = await query<Proposal>(`SELECT ${PROPOSAL_COLS} FROM rule_proposals WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listProposals(opts: { status?: "open" | "closed"; limit?: number } = {}): Promise<Proposal[]> {
  const where = opts.status === "open" ? "WHERE status = 'open'" : opts.status === "closed" ? "WHERE status <> 'open'" : "";
  return query<Proposal>(`SELECT ${PROPOSAL_COLS} FROM rule_proposals ${where} ORDER BY id DESC LIMIT $1`, [opts.limit ?? 50]);
}

/** 이 사람이 진행 중인 투표에 낸 표 */
export async function myVotes(fp: string): Promise<Record<string, 1 | -1>> {
  const rows = await query<{ proposal_id: string; value: 1 | -1 }>(
    `SELECT v.proposal_id::text, v.value FROM rule_votes v JOIN rule_proposals p ON p.id = v.proposal_id
      WHERE v.fingerprint = $1 AND p.status = 'open' AND v.voided_at IS NULL AND v.value <> 0`,
    [fp],
  );
  return Object.fromEntries(rows.map((r) => [r.proposal_id, r.value]));
}

/** value: 1 찬성, -1 반대, 0 취소 */
export async function voteOnProposal(id: string, fp: string, value: 1 | -1 | 0, netHash?: string): Promise<Proposal> {
  if (!ID.test(id)) throw new HttpError(404, "not_found", "제안을 찾을 수 없습니다.");
  await tx(async (client) => {
    const { rows } = await client.query<{ status: string; open: boolean; proposer_fingerprint: string; created_at: string }>(
      "SELECT status, closes_at > now() AS open, proposer_fingerprint, created_at FROM rule_proposals WHERE id = $1 FOR UPDATE",
      [id],
    );
    const p = rows[0];
    if (!p) throw new HttpError(404, "not_found", "제안을 찾을 수 없습니다.");
    if (p.status !== "open" || !p.open) throw new HttpError(409, "closed", "투표가 끝난 제안이에요.");
    if (p.proposer_fingerprint === fp) throw new HttpError(409, "own_proposal", "제안한 사람의 표는 찬성으로 이미 세어져 있어요.");
    const existing = await client.query<{ voided: boolean }>(
      "SELECT voided_at IS NOT NULL AS voided FROM rule_votes WHERE proposal_id = $1 AND fingerprint = $2",
      [id, fp],
    );
    if (existing.rows[0]?.voided) throw new HttpError(403, "vote_voided", "이 표는 무효 처리되어 다시 낼 수 없어요.");
    if (existing.rows[0]) {
      // 이미 낸 표: 찬반만 바꾼다 (취소는 0). 표를 낸 때의 계정 나이·기여 수·망·시각은 처음 것으로 고정 —
      // 탐지된 뒤 기여를 늘려 다시 내 기록을 바꾸는 것을 막는다 (Sprint 29)
      await client.query("UPDATE rule_votes SET value = $3 WHERE proposal_id = $1 AND fingerprint = $2", [id, fp, value]);
    } else if (value !== 0) {
      const status = await voterStatus(fp, client, p.created_at);
      if (!status.weight) throw new HttpError(403, "not_eligible", status.reason ?? "투표할 수 없어요.");
      if (netHash && status.ageDays < NET_CAP_EXEMPT_AGE_DAYS) {
        const same = await client.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM rule_votes WHERE proposal_id = $1 AND net_hash = $2 AND voided_at IS NULL",
          [id, netHash],
        );
        if ((same.rows[0]?.n ?? 0) >= NET_VOTES_PER_PROPOSAL) {
          throw new HttpError(409, "network_limit", `같은 곳(접속 망)에서 이미 ${NET_VOTES_PER_PROPOSAL}표가 들어온 투표예요. 한 곳에서 여러 계정으로 투표하지 못하게, 첫 활동 후 ${NET_CAP_EXEMPT_AGE_DAYS}일이 안 된 계정은 막고 있어요.`);
        }
      }
      await client.query(
        `INSERT INTO rule_votes (proposal_id, fingerprint, value, weight, voter_age_days, voter_contributions, net_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, fp, value, status.weight, round1(status.ageDays), status.contributions, netHash ?? null],
      );
    }
    await refreshTally(client, id);
  });
  return (await getProposal(id))!;
}

export async function withdrawProposal(id: string, fp: string, pin: string): Promise<void> {
  if (!ID.test(id)) throw new HttpError(404, "not_found", "제안을 찾을 수 없습니다.");
  await tx(async (client) => {
    const { rows } = await client.query<{ status: string; pw_hash: string }>("SELECT status, pw_hash FROM rule_proposals WHERE id = $1 FOR UPDATE", [id]);
    const p = rows[0];
    if (!p) throw new HttpError(404, "not_found", "제안을 찾을 수 없습니다.");
    await assertPin(`rule:${id}`, fp, pin, p.pw_hash);
    if (p.status !== "open") throw new HttpError(409, "closed", "이미 끝난 제안이에요.");
    await client.query("UPDATE rule_proposals SET status = 'withdrawn', result_note = '제안자 철회', closed_at = now() WHERE id = $1", [id]);
  });
}

// ---------------------------------------------------------------------------
// 마감 (정리 배치)
// ---------------------------------------------------------------------------

export type ClosedProposal = { id: string; key: RuleKey; passed: boolean; note: string };

/** 기한이 지난 제안을 집계해 가결이면 규칙 값을 바꾼다. 여러 인스턴스가 동시에 불러도 한 번만 처리된다. */
export async function closeDueProposals(now = new Date()): Promise<ClosedProposal[]> {
  // 검토 중인 조작 의심 알림이 있으면 운영자 검토(무효화 또는 오탐 닫기)까지 마감을 미룬다 — 최대 HOLD_HOURS
  const due = await query<{ id: string }>(
    `SELECT p.id::text FROM rule_proposals p
      WHERE p.status = 'open' AND p.closes_at <= $1
        AND (p.closes_at <= $1::timestamptz - make_interval(hours => $2)
             OR NOT EXISTS (SELECT 1 FROM abuse_alerts a WHERE a.kind = 'rule_vote_ring' AND a.subject_id = p.id::text AND a.status = 'open'))
      ORDER BY p.id`,
    [now.toISOString(), HOLD_HOURS],
  );
  const out: ClosedProposal[] = [];
  for (const { id } of due) {
    const done = await tx(async (client) => {
      const { rows } = await client.query<{ rule_key: RuleKey; from_value: number; to_value: number; quorum: number; status: string }>(
        "SELECT rule_key, from_value::float8 AS from_value, to_value::float8 AS to_value, quorum::float8 AS quorum, status FROM rule_proposals WHERE id = $1 FOR UPDATE SKIP LOCKED",
        [id],
      );
      const p = rows[0];
      if (!p || p.status !== "open") return null;
      await refreshTally(client, id);
      const t = await client.query<{ yes: number; no: number }>("SELECT yes_weight::float8 AS yes, no_weight::float8 AS no FROM rule_proposals WHERE id = $1", [id]);
      const result = tally(t.rows[0]!.yes, t.rows[0]!.no, p.quorum);
      if (result.passed) {
        await client.query("UPDATE community_rules SET value = $2, updated_at = now() WHERE key = $1", [p.rule_key, p.to_value]);
        await client.query("INSERT INTO rule_changes (rule_key, from_value, to_value, proposal_id) VALUES ($1, $2, $3, $4)", [p.rule_key, p.from_value, p.to_value, id]);
      }
      await client.query("UPDATE rule_proposals SET status = $2, result_note = $3, closed_at = now() WHERE id = $1", [id, result.passed ? "passed" : "rejected", result.note]);
      return { id, key: p.rule_key, passed: result.passed, note: result.note };
    });
    if (done) out.push(done);
  }
  if (out.some((c) => c.passed)) invalidateRules();
  return out;
}

export type RuleChange = { id: string; rule_key: RuleKey; from_value: number; to_value: number; proposal_id: string; created_at: string };

export async function ruleChanges(limit = 50): Promise<RuleChange[]> {
  return query<RuleChange>(
    "SELECT id::text, rule_key, from_value::float8 AS from_value, to_value::float8 AS to_value, proposal_id::text, created_at FROM rule_changes ORDER BY id DESC LIMIT $1",
    [limit],
  );
}

// ---------------------------------------------------------------------------
// 운영자: 권리침해 사유 가림 (공개 기록)
// ---------------------------------------------------------------------------

export async function hideProposalReason(id: string, note: string): Promise<void> {
  if (!ID.test(id)) throw new HttpError(404, "not_found", "제안을 찾을 수 없습니다.");
  await tx(async (client) => {
    const res = await client.query("UPDATE rule_proposals SET reason_hidden_at = now() WHERE id = $1 AND reason_hidden_at IS NULL", [id]);
    if (!res.rowCount) throw new HttpError(409, "already_hidden", "없거나 이미 가린 제안입니다.");
    await client.query(
      "INSERT INTO moderation_log (action, post_id, subject_type, subject_id, note) VALUES ('rule_reason_hidden', NULL, 'rule_proposal', $1::text, $2)",
      [id, note.slice(0, 300)],
    );
  });
}


export type RuleState = { key: RuleKey; open_id: string | null; next_proposal_at: string | null; changes: number; updated_at: string | null };

/** 규칙마다: 진행 중인 제안, 다시 제안할 수 있는 때(결정 후 대기), 바뀐 횟수 */
export async function ruleStates(): Promise<Record<RuleKey, RuleState>> {
  const rows = await query<RuleState>(
    `SELECT r.key,
            (SELECT id::text FROM rule_proposals WHERE rule_key = r.key AND status = 'open') AS open_id,
            (SELECT max(closed_at) + make_interval(days => $1) FROM rule_proposals
              WHERE rule_key = r.key AND status IN ('passed', 'rejected') AND closed_at > now() - make_interval(days => $1)) AS next_proposal_at,
            (SELECT count(*)::int FROM rule_changes WHERE rule_key = r.key) AS changes,
            r.updated_at
       FROM community_rules r`,
    [COOLDOWN_DAYS],
  );
  const out = {} as Record<RuleKey, RuleState>;
  for (const r of rows) if (isRuleKey(r.key)) out[r.key] = r;
  return out;
}

// ---------------------------------------------------------------------------
// 조작 탐지 (Sprint 23)
// ---------------------------------------------------------------------------

/**
 * 한 제안에서 조작이 의심되는 표. 정리 배치의 탐지, 운영자의 무효화 미리보기·실행이 모두 이 조회를 쓴다
 * (운영자가 어떤 표를 뺄지 고르지 않는다). $1 = 제안 번호. 표를 낼 때 남긴 계정 나이·기여 수·망 식별값으로 판단한다.
 */
export const RING_SQL = `
  WITH v AS (
    SELECT fingerprint, value, weight, voter_age_days AS age, voter_contributions AS contrib, net_hash, created_at
      FROM rule_votes WHERE proposal_id = $1 AND voided_at IS NULL AND value <> 0 AND voter_age_days IS NOT NULL
  ), side AS (SELECT value, count(*) AS n FROM v GROUP BY value),
  fresh_side AS (
    SELECT v.value FROM v JOIN side USING (value)
     WHERE v.age < ${FRESH_AGE_DAYS} AND v.contrib <= ${FRESH_MAX_CONTRIBUTIONS}
     GROUP BY v.value, side.n HAVING count(*) >= ${FRESH_MIN_VOTES} AND count(*) >= side.n * ${FRESH_MIN_SHARE}
  ), net AS (
    SELECT value, net_hash FROM v WHERE net_hash IS NOT NULL AND age < ${NET_YOUNG_DAYS}
     GROUP BY value, net_hash HAVING count(*) >= ${NET_MIN_VOTES}
  )
  SELECT v.fingerprint, v.value, v.weight::float8 AS weight, v.created_at,
         (v.age < ${FRESH_AGE_DAYS} AND v.contrib <= ${FRESH_MAX_CONTRIBUTIONS} AND v.value IN (SELECT value FROM fresh_side)) AS fresh,
         (v.age < ${NET_YOUNG_DAYS} AND EXISTS (SELECT 1 FROM net WHERE net.value = v.value AND net.net_hash = v.net_hash)) AS same_net
    FROM v
   WHERE (v.age < ${FRESH_AGE_DAYS} AND v.contrib <= ${FRESH_MAX_CONTRIBUTIONS} AND v.value IN (SELECT value FROM fresh_side))
      OR (v.age < ${NET_YOUNG_DAYS} AND EXISTS (SELECT 1 FROM net WHERE net.value = v.value AND net.net_hash = v.net_hash))`;

export type RingFinding = {
  proposalId: string;
  key: RuleKey;
  from: number;
  to: number;
  flagged: number;
  flaggedYes: number;
  flaggedNo: number;
  fresh: number;
  sameNet: number;
  /** 이 표들을 빼면 결과(가결 여부)가 바뀌는가 */
  flips: boolean;
  windowStart: string;
  /** 가장 최근에 들어온 의심 표 — 오탐으로 닫은 뒤 새 의심 표가 오면 알림을 다시 연다 (Sprint 29) */
  latestAt: string;
};

/** 진행 중인 제안마다 탐지 (정리 배치에서 호출) */
export async function findRingVotes(client: PoolClient): Promise<RingFinding[]> {
  const open = await client.query<{ id: string; rule_key: RuleKey; from_value: number; to_value: number; quorum: number; yes: number; no: number }>(
    `SELECT id::text, rule_key, from_value::float8 AS from_value, to_value::float8 AS to_value, quorum::float8 AS quorum,
            yes_weight::float8 AS yes, no_weight::float8 AS no FROM rule_proposals WHERE status = 'open'`,
  );
  const out: RingFinding[] = [];
  for (const p of open.rows) {
    const { rows } = await client.query<{ value: number; weight: number; created_at: string; fresh: boolean; same_net: boolean }>(RING_SQL, [p.id]);
    if (!rows.length) continue;
    const yesW = rows.filter((r) => r.value === 1).reduce((a, r) => a + r.weight, 0);
    const noW = rows.filter((r) => r.value === -1).reduce((a, r) => a + r.weight, 0);
    out.push({
      proposalId: p.id,
      key: p.rule_key,
      from: p.from_value,
      to: p.to_value,
      flagged: rows.length,
      flaggedYes: rows.filter((r) => r.value === 1).length,
      flaggedNo: rows.filter((r) => r.value === -1).length,
      fresh: rows.filter((r) => r.fresh).length,
      sameNet: rows.filter((r) => r.same_net).length,
      flips: tally(p.yes, p.no, p.quorum).passed !== tally(p.yes - yesW, p.no - noW, p.quorum).passed,
      windowStart: rows.map((r) => new Date(r.created_at).toISOString()).sort()[0]!,
      latestAt: rows.map((r) => new Date(r.created_at).toISOString()).sort().at(-1)!,
    });
  }
  return out;
}

/** 탐지된 표 무효화 (운영자 조치 — operator.voidAlert 에서 트랜잭션 안에 호출) */
export async function voidRingVotes(client: PoolClient, proposalId: string): Promise<number> {
  // 마감된 투표의 표를 무효화하면 공개된 집계만 바뀌고 결과·규칙 값은 그대로라 기록이 서로 어긋난다 (Sprint 29)
  const st = await client.query<{ status: string }>("SELECT status FROM rule_proposals WHERE id = $1 FOR UPDATE", [proposalId]);
  if (st.rows[0]?.status !== "open") throw new HttpError(409, "proposal_closed", "이미 마감된 투표예요. 마감 뒤에는 표를 무효화할 수 없어요.");
  const { rowCount } = await client.query(
    `UPDATE rule_votes SET voided_at = now() WHERE proposal_id = $1 AND fingerprint IN (SELECT fingerprint FROM (${RING_SQL}) ring)`,
    [proposalId],
  );
  await refreshTally(client, proposalId);
  return rowCount ?? 0;
}

export type AgeBuckets = { young: number; mid: number; old: number };
export type ProposalIntegrity = { yes: AgeBuckets; no: AgeBuckets; voided: number; reviewing: boolean };

/**
 * 공개용: 찬성·반대 투표자의 계정 나이 분포(30일 미만 / 30~90일 / 90일 이상, 표를 낼 때 기준), 무효 처리된 표 수,
 * 조작 의심으로 검토 중인지. 개별 투표자는 드러내지 않는다.
 */
export async function proposalIntegrity(ids: string[]): Promise<Record<string, ProposalIntegrity>> {
  if (!ids.length) return {};
  const rows = await query<{ id: string; value: number; young: number; mid: number; old: number; voided: number }>(
    `SELECT proposal_id::text AS id, value,
            count(*) FILTER (WHERE voided_at IS NULL AND voter_age_days < 30)::int AS young,
            count(*) FILTER (WHERE voided_at IS NULL AND voter_age_days >= 30 AND voter_age_days < 90)::int AS mid,
            count(*) FILTER (WHERE voided_at IS NULL AND (voter_age_days >= 90 OR voter_age_days IS NULL))::int AS old,
            count(*) FILTER (WHERE voided_at IS NOT NULL)::int AS voided
       FROM rule_votes WHERE proposal_id = ANY($1::bigint[]) AND value <> 0 GROUP BY proposal_id, value`,
    [ids],
  );
  const reviewing = await query<{ id: string }>(
    "SELECT subject_id AS id FROM abuse_alerts WHERE kind = 'rule_vote_ring' AND status = 'open' AND subject_id = ANY($1::text[])",
    [ids],
  );
  const empty = (): AgeBuckets => ({ young: 0, mid: 0, old: 0 });
  const out: Record<string, ProposalIntegrity> = {};
  for (const id of ids) out[id] = { yes: empty(), no: empty(), voided: 0, reviewing: false };
  for (const r of rows) {
    const side = r.value === 1 ? out[r.id]!.yes : out[r.id]!.no;
    side.young += r.young;
    side.mid += r.mid;
    side.old += r.old;
    out[r.id]!.voided += r.voided;
  }
  for (const r of reviewing) if (out[r.id]) out[r.id]!.reviewing = true;
  return out;
}
