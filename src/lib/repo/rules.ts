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

/** 글·댓글·정정 제안 수 (블라인드된 글은 빼고) */
const CONTRIBUTIONS = `
  (SELECT count(*) FROM posts WHERE author_fingerprint = $1 AND NOT is_blinded)
  + (SELECT count(*) FROM comments WHERE author_fingerprint = $1)
  + (SELECT count(*) FROM corrections WHERE author_fingerprint = $1)`;

export type VoterStatus = Eligibility & { ageDays: number; contributions: number };

export async function voterStatus(fp: string, client?: PoolClient): Promise<VoterStatus> {
  const sql = `SELECT extract(epoch FROM now() - f.first_seen)::float8 / 86400 AS age, (${CONTRIBUTIONS})::int AS n
                 FROM (SELECT $1::char(64) AS fp) x LEFT JOIN fingerprints f ON f.fingerprint = x.fp`;
  const rows = client ? (await client.query<{ age: number | null; n: number }>(sql, [fp])).rows : await query<{ age: number | null; n: number }>(sql, [fp]);
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

export type ProposalInput = { key: RuleKey; value: number; reason: string; nickname: string; pin: string; fingerprint: string };

export async function createProposal(input: ProposalInput): Promise<Proposal> {
  const problem = reasonProblem(input.reason);
  if (problem) throw new HttpError(400, "invalid_input", problem);
  const pwHash = await hashPin(input.pin);
  const id = await tx(async (client) => {
    const status = await voterStatus(input.fingerprint, client);
    if (!status.weight) throw new HttpError(403, "not_eligible", `규칙 변경을 제안할 수 없어요. ${status.reason}`);
    // 같은 규칙에 대한 동시 제안을 한 줄로 세운다
    await client.query("SELECT key FROM community_rules WHERE key = $1 FOR UPDATE", [input.key]);
    const open = await client.query("SELECT id FROM rule_proposals WHERE rule_key = $1 AND status = 'open'", [input.key]);
    if (open.rows[0]) throw new HttpError(409, "proposal_open", "이 규칙은 이미 투표가 진행 중이에요. 그 투표에 참여해주세요.");
    const recent = await client.query<{ closed_at: string }>(
      `SELECT closed_at FROM rule_proposals WHERE rule_key = $1 AND status IN ('passed', 'rejected')
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
    await client.query("INSERT INTO rule_votes (proposal_id, fingerprint, value, weight) VALUES ($1, $2, 1, $3)", [proposalId, input.fingerprint, status.weight]);
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
       voter_count = (SELECT count(*) FROM rule_votes WHERE proposal_id = p.id AND voided_at IS NULL)
     WHERE id = $1`,
    [proposalId],
  );
}

const ID = /^\d{1,18}$/;

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
      WHERE v.fingerprint = $1 AND p.status = 'open' AND v.voided_at IS NULL`,
    [fp],
  );
  return Object.fromEntries(rows.map((r) => [r.proposal_id, r.value]));
}

/** value: 1 찬성, -1 반대, 0 취소 */
export async function voteOnProposal(id: string, fp: string, value: 1 | -1 | 0): Promise<Proposal> {
  if (!ID.test(id)) throw new HttpError(404, "not_found", "제안을 찾을 수 없습니다.");
  await tx(async (client) => {
    const { rows } = await client.query<{ status: string; open: boolean; proposer_fingerprint: string }>(
      "SELECT status, closes_at > now() AS open, proposer_fingerprint FROM rule_proposals WHERE id = $1 FOR UPDATE",
      [id],
    );
    const p = rows[0];
    if (!p) throw new HttpError(404, "not_found", "제안을 찾을 수 없습니다.");
    if (p.status !== "open" || !p.open) throw new HttpError(409, "closed", "투표가 끝난 제안이에요.");
    if (p.proposer_fingerprint === fp) throw new HttpError(409, "own_proposal", "제안한 사람의 표는 찬성으로 이미 세어져 있어요.");
    if (value === 0) {
      await client.query("DELETE FROM rule_votes WHERE proposal_id = $1 AND fingerprint = $2 AND voided_at IS NULL", [id, fp]);
    } else {
      const status = await voterStatus(fp, client);
      if (!status.weight) throw new HttpError(403, "not_eligible", status.reason ?? "투표할 수 없어요.");
      // 무효화된 표는 다시 살릴 수 없다
      const res = await client.query(
        `INSERT INTO rule_votes (proposal_id, fingerprint, value, weight) VALUES ($1, $2, $3, $4)
         ON CONFLICT (proposal_id, fingerprint) DO UPDATE SET value = EXCLUDED.value, weight = EXCLUDED.weight, created_at = now()
           WHERE rule_votes.voided_at IS NULL`,
        [id, fp, value, status.weight],
      );
      if (!res.rowCount) throw new HttpError(403, "vote_voided", "이 표는 무효 처리되어 다시 낼 수 없어요.");
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
  const due = await query<{ id: string }>("SELECT id::text FROM rule_proposals WHERE status = 'open' AND closes_at <= $1 ORDER BY id", [now.toISOString()]);
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
