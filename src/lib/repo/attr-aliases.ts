/**
 * 성분명 별칭 (Sprint 35) — "비타민 D3"·"Vitamin D"·"콜레칼시페롤"처럼 이름만 다른 같은 성분을 합친다.
 *
 * 브랜드 별칭(Sprint 31)과 같은 흐름이다:
 *  1. 이용자가 보드의 성분 순위 화면에서 "같은 성분" 제안 (이유 필수, 두 항목 모두 보이는 수치가 있어야 함)
 *  2. 이용자 동의·반대 — 정정 제안과 같은 "커뮤니티 동의" 기준, 같은 망의 표는 한 사람으로, 제안자 망의 표는 세지 않음
 *  3. 동의된 제안만 운영자가 확정 (기각은 언제든) — 확정·기각·해제 모두 /transparency 에 공개
 *
 * 이름의 뜻은 보드마다 다를 수 있어(예: "무게") 별칭은 보드 단위다. 확정하면 별칭 쪽 수치의 항목 키를 대표 키로 바꾼다
 * (표시 이름은 쓴 그대로). 정정 제안·리뉴얼 기록도 같은 수치를 가리키게 함께 바꾼다.
 * 영양제 보드에는 기본 사전(proposal_id 없음, db/migrations/033)이 있고 운영자가 해제할 수 있다.
 */
import type { PoolClient } from "pg";
import { query, tx } from "../db";
import { isSupported } from "../corrections";
import { HttpError, notFound } from "../errors";
import { attrKey, iuFactor } from "../products";
import { writeLog } from "./operator";
import { ATTR_ALIAS_LOCK } from "./products";
import { reconcileRenewals } from "./renewals";
import { getRules } from "./rules";

const ID = /^\d{1,18}$/;
const VISIBLE_POST = "NOT p.is_blinded AND NOT p.is_suppressed";

type Q = Pick<PoolClient, "query">;
const run = async <T>(c: Q | null, sql: string, args: unknown[]): Promise<T[]> =>
  c ? (await c.query(sql, args)).rows as T[] : query<T & Record<string, unknown>>(sql, args) as Promise<T[]>;

export function isAttrKey(key: string): boolean {
  return key.length > 0 && key.length <= 40 && attrKey(key) === key;
}

/** 이 보드에서 별칭이면 대표 항목 키, 아니면 그대로 */
export async function canonicalAttrKey(categoryId: number, key: string, client: Q | null = null): Promise<string> {
  const rows = await run<{ canonical_key: string }>(client, "SELECT canonical_key FROM attr_aliases WHERE category_id = $1 AND alias_key = $2", [categoryId, key]);
  return rows[0]?.canonical_key ?? key;
}

export type AttrInfo = { key: string; label: string; products: number };

/** 보이는 글의 수치가 있는 항목의 대표 표기(가장 많이 쓴 이름)와 제품 수 */
async function attrInfo(categoryId: number, key: string, client: Q | null = null): Promise<AttrInfo | null> {
  const rows = await run<AttrInfo>(
    client,
    `SELECT $2::text AS key, mode() WITHIN GROUP (ORDER BY f.attribute) AS label, count(DISTINCT f.product_id)::int AS products
       FROM product_facts f JOIN posts p ON p.id = f.post_id JOIN products pr ON pr.id = f.product_id
      WHERE pr.category_id = $1 AND f.attr_key = $2 AND pr.merged_into IS NULL AND ${VISIBLE_POST}`,
    [categoryId, key],
  );
  return rows[0] && rows[0].products > 0 ? rows[0] : null;
}

export type AttrAlias = { key: string; label: string; builtin: boolean; created_at: string };

/** 이 항목으로 합쳐진 다른 이름 (기본 사전 포함) */
export async function aliasesOf(categoryId: number, canonical: string): Promise<AttrAlias[]> {
  return query<AttrAlias>(
    `SELECT alias_key AS key, alias_label AS label, proposal_id IS NULL AS builtin, created_at
       FROM attr_aliases WHERE category_id = $1 AND canonical_key = $2 ORDER BY proposal_id IS NULL DESC, created_at, alias_key`,
    [categoryId, canonical],
  );
}

export type AttrAliasProposal = {
  id: string;
  category_id: number;
  attr_a: string;
  attr_b: string;
  label_a: string;
  label_b: string;
  reason: string;
  reason_hidden: boolean;
  nickname: string;
  status: "open" | "accepted" | "rejected";
  agree_count: number;
  disagree_count: number;
  is_supported: boolean;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string;
  canonical_key: string | null;
  rekeyed_facts: number;
  my_vote?: 1 | -1 | 0;
};

const COLS = `p.id::text, p.category_id, p.attr_a, p.attr_b, p.label_a, p.label_b,
  CASE WHEN p.reason_hidden THEN '' ELSE p.reason END AS reason, p.reason_hidden, p.nickname, p.status, p.agree_count, p.disagree_count,
  p.is_supported, p.created_at, p.resolved_at, p.resolution_note, p.canonical_key, p.rekeyed_facts`;

/** 성분 순위 화면: 이 항목(또는 이 항목으로 합쳐진 별칭)이 들어간 제안 — 열린 것 먼저 */
export async function listProposals(categoryId: number, key: string, fp: string | null = null): Promise<AttrAliasProposal[]> {
  return query<AttrAliasProposal>(
    `WITH keys AS (SELECT $2::text AS k UNION SELECT alias_key FROM attr_aliases WHERE category_id = $1 AND canonical_key = $2)
     SELECT ${COLS}, coalesce((SELECT v.value FROM attr_alias_votes v WHERE v.proposal_id = p.id AND v.voter_fingerprint = $3), 0)::int AS my_vote
       FROM attr_alias_proposals p
      WHERE p.category_id = $1 AND (p.attr_a IN (SELECT k FROM keys) OR p.attr_b IN (SELECT k FROM keys))
      ORDER BY (p.status = 'open') DESC, p.created_at DESC LIMIT 30`,
    [categoryId, key, fp],
  );
}

export type AliasRow = { category_id: number; board: string; alias_key: string; canonical_key: string; label: string; builtin: boolean; created_at: string };

/** 운영자 화면: 열린 제안 (동의된 것 먼저) + 확정된 별칭 (이용자 제안 최근 것 먼저, 그다음 기본 사전) */
export async function listForReview(): Promise<{ open: (AttrAliasProposal & { board: string })[]; aliases: AliasRow[] }> {
  const [open, aliases] = await Promise.all([
    query<AttrAliasProposal & { board: string }>(
      `SELECT ${COLS}, c.name AS board FROM attr_alias_proposals p JOIN categories c ON c.id = p.category_id
        WHERE p.status = 'open' ORDER BY p.is_supported DESC, p.created_at LIMIT 50`,
    ),
    query<AliasRow>(
      `SELECT a.category_id, c.name AS board, a.alias_key, a.canonical_key, a.alias_label AS label, a.proposal_id IS NULL AS builtin, a.created_at
         FROM attr_aliases a JOIN categories c ON c.id = a.category_id
        ORDER BY a.proposal_id IS NULL, a.created_at DESC, a.canonical_key, a.alias_key LIMIT 200`,
    ),
  ]);
  return { open, aliases };
}

export const MAX_PROPOSALS_PER_DAY = 5;

/**
 * "이 항목과 저 항목은 같은 성분" 제안. 둘 다 별칭이면 대표 키로 바꿔 비교하고,
 * 이미 같은 항목이거나 같은 두 항목의 열린 제안이 있으면 거절한다.
 */
export async function createProposal(input: {
  categoryId: number;
  attrKey: string;
  other: string;
  reason: string;
  nickname: string;
  fingerprint: string;
  net: string | null;
}): Promise<AttrAliasProposal> {
  const otherKey = attrKey(input.other);
  if (!isAttrKey(input.attrKey) || !otherKey) throw new HttpError(400, "invalid_attribute", "성분 이름을 확인하세요.");
  return tx(async (client) => {
    const c = input.categoryId;
    const [a0, b0] = [await canonicalAttrKey(c, input.attrKey, client), await canonicalAttrKey(c, otherKey, client)];
    if (a0 === b0) throw new HttpError(409, "already_same", "이미 같은 성분으로 묶여 있습니다.");
    const [ia, ib] = [await attrInfo(c, a0, client), await attrInfo(c, b0, client)];
    if (!ia || !ib) throw new HttpError(404, "attribute_not_found", "이 보드에서 보이는 수치가 있는 항목끼리만 제안할 수 있습니다.");
    // 순서 없는 쌍은 UTF-8 바이트 순서로 (DB 의 CHECK ... COLLATE "C" 와 같게)
    const [x, y] = Buffer.compare(Buffer.from(a0), Buffer.from(b0)) < 0 ? [ia, ib] : [ib, ia];
    // 제안 도배 방지: 한 사람·한 망이 하루에 여러 건
    const recent = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM attr_alias_proposals
        WHERE created_at > now() - interval '1 day' AND (proposer_fingerprint = $1 OR ($2::text IS NOT NULL AND proposer_net = $2))`,
      [input.fingerprint, input.net],
    );
    if (recent.rows[0]!.n >= MAX_PROPOSALS_PER_DAY) throw new HttpError(429, "rate_limited", "성분 이름 제안은 하루에 5건까지 올릴 수 있어요.");
    const ins = await client.query<{ id: string }>(
      `INSERT INTO attr_alias_proposals (category_id, attr_a, attr_b, label_a, label_b, reason, nickname, proposer_fingerprint, proposer_net)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (category_id, attr_a, attr_b) WHERE status = 'open' DO NOTHING RETURNING id::text`,
      [c, x.key, y.key, x.label.slice(0, 40), y.label.slice(0, 40), input.reason, input.nickname, input.fingerprint, input.net],
    );
    if (!ins.rows[0]) throw new HttpError(409, "proposal_exists", "같은 두 항목에 대한 제안이 이미 열려 있어요. 그 제안에 동의해 주세요.");
    const { rows } = await client.query<AttrAliasProposal>(`SELECT ${COLS}, 0 AS my_vote FROM attr_alias_proposals p WHERE p.id = $1`, [ins.rows[0].id]);
    return rows[0]!;
  });
}

export type AttrVoteResult = Pick<AttrAliasProposal, "agree_count" | "disagree_count" | "is_supported"> & { my_vote: 1 | -1 | 0 };

/** 동의(1)·반대(-1), 같은 값을 다시 누르면 취소. 제안자(같은 망 포함)는 투표할 수 없다 */
export async function voteProposal(id: string, fp: string, net: string | null, value: 1 | -1): Promise<AttrVoteResult> {
  if (!ID.test(id)) throw notFound("성분 이름 제안");
  return tx(async (client) => {
    const { rows } = await client.query<{ status: string; proposer_fingerprint: string | null; proposer_net: string | null }>(
      "SELECT status, proposer_fingerprint, proposer_net FROM attr_alias_proposals WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!rows[0]) throw notFound("성분 이름 제안");
    if (rows[0].status !== "open") throw new HttpError(409, "proposal_closed", "이미 처리된 제안입니다.");
    if (rows[0].proposer_fingerprint === fp || (net && rows[0].proposer_net === net)) {
      throw new HttpError(403, "own_proposal", "내가 올린 제안에는 투표할 수 없습니다.");
    }
    const existing = await client.query<{ value: number }>("SELECT value FROM attr_alias_votes WHERE proposal_id = $1 AND voter_fingerprint = $2", [id, fp]);
    let myVote: 1 | -1 | 0 = value;
    if (!existing.rows[0]) {
      // 갓 생긴 식별값(첫 활동 1시간 이내)의 표는 절반 (정정 제안·브랜드 별칭과 같게)
      await client.query(
        `INSERT INTO attr_alias_votes (proposal_id, voter_fingerprint, voter_net, value, weight)
         VALUES ($1, $2, $3, $4, CASE WHEN coalesce((SELECT first_seen > now() - interval '1 hour' FROM fingerprints WHERE fingerprint = $2), true) THEN 0.5 ELSE 1 END)`,
        [id, fp, net, value],
      );
    } else if (existing.rows[0].value === value) {
      await client.query("DELETE FROM attr_alias_votes WHERE proposal_id = $1 AND voter_fingerprint = $2", [id, fp]);
      myVote = 0;
    } else {
      await client.query("UPDATE attr_alias_votes SET value = $3 WHERE proposal_id = $1 AND voter_fingerprint = $2", [id, fp, value]);
    }
    const a = await retally(client, id);
    return { ...a, my_vote: myVote };
  });
}

/** 지금 규칙으로 다시 센다. 같은 망(없으면 같은 식별값)의 같은 쪽 표는 하나로, 제안자 망의 표는 빼고 */
async function retally(client: Q, id: string): Promise<{ agree_count: number; disagree_count: number; is_supported: boolean }> {
  const { rows: agg } = await client.query<{ agree_count: number; disagree_count: number; agree_score: number; disagree_score: number }>(
    `SELECT count(*) FILTER (WHERE value = 1)::int AS agree_count, count(*) FILTER (WHERE value = -1)::int AS disagree_count,
            coalesce(sum(w) FILTER (WHERE value = 1), 0)::float8 AS agree_score, coalesce(sum(w) FILTER (WHERE value = -1), 0)::float8 AS disagree_score
       FROM (SELECT v.value, max(v.weight) AS w FROM attr_alias_votes v JOIN attr_alias_proposals p ON p.id = v.proposal_id
              WHERE v.proposal_id = $1 AND v.voter_net IS DISTINCT FROM p.proposer_net
              GROUP BY v.value, coalesce(v.voter_net, v.voter_fingerprint)) g`,
    [id],
  );
  const a = agg[0]!;
  const rules = await getRules();
  const supported = isSupported(a.agree_score, a.disagree_score, rules.correction_support_score, rules.correction_support_ratio);
  await client.query(
    `UPDATE attr_alias_proposals SET agree_count = $2, disagree_count = $3, agree_score = $4, disagree_score = $5, is_supported = $6,
            supported_at = CASE WHEN NOT $6 THEN NULL WHEN is_supported THEN supported_at ELSE now() END
      WHERE id = $1`,
    [id, a.agree_count, a.disagree_count, a.agree_score, a.disagree_score, supported],
  );
  return { agree_count: a.agree_count, disagree_count: a.disagree_count, is_supported: supported };
}

export type AttrAliasPlan = {
  canonical: string;
  alias: string;
  canonicalLabel: string;
  aliasLabel: string;
  /** 대표 키로 바꿀 수치 수와 그 제품 수 */
  facts: number;
  products: number;
  /** 합쳐도 단위를 바꿔 계산할 수 없어 따로 비교되는 단위 (예: 한쪽만 IU) */
  unitGroups: { canonical: string[]; alias: string[] };
  /** 비타민 D 처럼 IU 를 질량으로 바꾸게 되는 수치 수 */
  iuConverted: number;
};

type RawPlan = AttrAliasPlan & { productIds: string[] };

/** 대표 다툼: 보이는 글의 수치가 있고, 처음 올라온 지 7일이 지난 제품 수 (확정 직전 스팸 글로 대표를 뺏지 못하게) */
async function planAlias(client: Q, p: { category_id: number; attr_a: string; attr_b: string; label_a: string; label_b: string }, prefer?: string): Promise<RawPlan> {
  const c = p.category_id;
  const a = await canonicalAttrKey(c, p.attr_a, client);
  const b = await canonicalAttrKey(c, p.attr_b, client);
  if (a === b) throw new HttpError(409, "already_same", "이미 같은 성분으로 묶여 있습니다.");
  let canonical: string;
  if (prefer) {
    const want = await canonicalAttrKey(c, prefer, client);
    if (want !== a && want !== b) throw new HttpError(400, "invalid_attribute", "대표 이름은 제안된 두 항목 중 하나여야 합니다.");
    canonical = want;
  } else {
    const size = (await client.query<{ key: string; n: number; first: string }>(
      `SELECT f.attr_key AS key,
              count(DISTINCT f.product_id) FILTER (WHERE ${VISIBLE_POST} AND p.created_at < now() - interval '7 days')::int AS n,
              min(f.id)::text AS first
         FROM product_facts f JOIN posts p ON p.id = f.post_id JOIN products pr ON pr.id = f.product_id
        WHERE pr.category_id = $1 AND pr.merged_into IS NULL AND f.attr_key = ANY($2::text[]) GROUP BY 1`,
      [c, [a, b]],
    )).rows;
    const info = (k: string) => size.find((r) => r.key === k) ?? { key: k, n: 0, first: "9".repeat(18) };
    const [ia, ib] = [info(a), info(b)];
    canonical = (ia.n !== ib.n ? ia.n > ib.n : BigInt(ia.first) <= BigInt(ib.first)) ? a : b;
  }
  const alias = canonical === a ? b : a;
  const label = (k: string) => (k === p.attr_a ? p.label_a : k === p.attr_b ? p.label_b : k);
  const { rows } = await client.query<{ product_id: string; unit_group: string; unit: string; key: string }>(
    `SELECT DISTINCT f.product_id::text, f.unit_group, f.unit, f.attr_key AS key
       FROM product_facts f JOIN products pr ON pr.id = f.product_id
      WHERE pr.category_id = $1 AND f.attr_key = ANY($2::text[])`,
    [c, [canonical, alias]],
  );
  const aliasRows = rows.filter((r) => r.key === alias);
  const { rows: cnt } = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM product_facts f JOIN products pr ON pr.id = f.product_id WHERE pr.category_id = $1 AND f.attr_key = $2",
    [c, alias],
  );
  const convert = iuFactor(canonical) !== null && iuFactor(alias) === null;
  const { rows: iu } = convert
    ? await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM product_facts f JOIN products pr ON pr.id = f.product_id WHERE pr.category_id = $1 AND f.attr_key = $2 AND f.unit = 'IU'",
        [c, alias],
      )
    : { rows: [{ n: 0 }] };
  const groups = (k: string) => [...new Set(rows.filter((r) => r.key === k).map((r) => (convert && r.unit === "IU" ? "mass" : r.unit_group)))].sort();
  return {
    canonical, alias, canonicalLabel: label(canonical), aliasLabel: label(alias),
    facts: cnt[0]!.n,
    products: new Set(aliasRows.map((r) => r.product_id)).size,
    unitGroups: { canonical: groups(canonical), alias: groups(alias) },
    iuConverted: iu[0]!.n,
    productIds: [...new Set(aliasRows.map((r) => r.product_id))],
  };
}

type ProposalRow = { category_id: number; attr_a: string; attr_b: string; label_a: string; label_b: string; status: string };

/** 운영자 화면: 확정하면 무엇이 바뀌는지 미리 보기 */
export async function previewProposal(id: string, prefer?: string): Promise<AttrAliasPlan> {
  if (!ID.test(id)) throw notFound("성분 이름 제안");
  return tx(async (client) => {
    const { rows } = await client.query<ProposalRow>("SELECT category_id, attr_a, attr_b, label_a, label_b, status FROM attr_alias_proposals WHERE id = $1", [id]);
    if (!rows[0]) throw notFound("성분 이름 제안");
    const { productIds: _ids, ...plan } = await planAlias(client, rows[0], prefer);
    return plan;
  });
}

/**
 * 수치의 항목 키를 바꾸고(정정 제안·리뉴얼 기록도 함께), IU 환산 여부가 달라지면 비교용 값을 다시 계산한 뒤
 * 그 제품들의 리뉴얼 판단을 새 묶음으로 다시 맞춘다. 바뀐 수치 수를 돌려준다.
 */
async function rekeyFacts(client: PoolClient, categoryId: number, factIds: string[], from: string, to: string, productIds: string[]): Promise<number> {
  if (!factIds.length) return 0;
  await client.query(
    `UPDATE corrections c SET fact_attr_key = $3
       FROM product_facts f
      WHERE f.id = ANY($1::bigint[]) AND c.post_id = f.post_id AND c.target = 'fact' AND c.fact_product_id = f.product_id
        AND c.fact_attr_key = $2 AND c.fact_kind = f.kind AND c.fact_value = f.value AND c.fact_unit = f.unit AND c.fact_basis = f.basis`,
    [factIds, from, to],
  );
  const { rowCount } = await client.query("UPDATE product_facts SET attr_key = $2 WHERE id = ANY($1::bigint[])", [factIds, to]);
  // 비타민 D 처럼 IU 를 바꿔 계산하는지가 달라지면 비교용 값(unit_group·base_value)도 새 규칙으로
  const [fFrom, fTo] = [iuFactor(from), iuFactor(to)];
  if (fFrom !== fTo) {
    await client.query(
      `UPDATE product_facts SET unit_group = CASE WHEN $2::float8 IS NULL THEN 'unit:IU' ELSE 'mass' END,
              base_value = value::float8 * coalesce($2::float8, 1)
        WHERE id = ANY($1::bigint[]) AND unit = 'IU'`,
      [factIds, fTo],
    );
  }
  // 리뉴얼 기록: 같은 제품·기준·묶음이면 대표 키로 옮겨 두고(처음 확인된 시각 유지 → 알림이 다시 가지 않게), 다시 계산해 맞춘다
  await client.query(
    `UPDATE product_renewals SET attr_key = $3,
            unit_group = CASE WHEN unit_group = 'unit:IU' AND $4::float8 IS NOT NULL THEN 'mass' WHEN unit_group = 'mass' AND unit = 'IU' AND $4::float8 IS NULL THEN 'unit:IU' ELSE unit_group END,
            old_base = CASE WHEN unit_group = 'unit:IU' AND $4::float8 IS NOT NULL THEN old_base * $4::float8 WHEN unit_group = 'mass' AND unit = 'IU' AND $4::float8 IS NULL THEN old_base / $5::float8 ELSE old_base END,
            new_base = CASE WHEN unit_group = 'unit:IU' AND $4::float8 IS NOT NULL THEN new_base * $4::float8 WHEN unit_group = 'mass' AND unit = 'IU' AND $4::float8 IS NULL THEN new_base / $5::float8 ELSE new_base END
      WHERE product_id = ANY($1::bigint[]) AND attr_key = $2 AND product_id IN (SELECT id FROM products WHERE category_id = $6)`,
    [productIds, from, to, fTo, fFrom ?? 1, categoryId],
  );
  await reconcileRenewals(client, productIds);
  return rowCount ?? 0;
}

export type AttrAcceptResult = { canonical: string; alias: string; rekeyed: number };

/** 운영자 확정 (동의된 제안만). 제품이 많은 쪽이 대표(같으면 먼저 쓰인 쪽), 운영자가 대표를 고를 수 있다 */
export async function acceptProposal(id: string, note: string, prefer?: string): Promise<AttrAcceptResult> {
  if (!ID.test(id)) throw notFound("성분 이름 제안");
  return tx(async (client) => {
    const { rows } = await client.query<ProposalRow>(
      "SELECT category_id, attr_a, attr_b, label_a, label_b, status FROM attr_alias_proposals WHERE id = $1 FOR UPDATE",
      [id],
    );
    const p = rows[0];
    if (!p) throw notFound("성분 이름 제안");
    if (p.status !== "open") throw new HttpError(409, "proposal_closed", "이미 처리된 제안입니다.");
    if (!(await retally(client, id)).is_supported) throw new HttpError(409, "not_supported", "커뮤니티 동의를 얻은 제안만 확정할 수 있습니다.");
    // 확정은 한 번에 하나씩, 그동안 새 수치 저장(setPostFacts 의 공유 잠금)도 기다린다
    await client.query("SELECT pg_advisory_xact_lock($1)", [ATTR_ALIAS_LOCK]);
    const plan = await planAlias(client, p, prefer);
    const { canonical, alias } = plan;
    const c = p.category_id;

    // 별칭의 별칭도 새 대표를 가리키게 (한 단계로 펴 둔다)
    await client.query("UPDATE attr_aliases SET canonical_key = $3 WHERE category_id = $1 AND canonical_key = $2", [c, alias, canonical]);
    await client.query(
      "INSERT INTO attr_aliases (category_id, alias_key, canonical_key, proposal_id, alias_label) VALUES ($1, $2, $3, $4, $5)",
      [c, alias, canonical, id, plan.aliasLabel.slice(0, 40)],
    );
    const { rows: facts } = await client.query<{ id: string }>(
      "SELECT f.id::text FROM product_facts f JOIN products pr ON pr.id = f.product_id WHERE pr.category_id = $1 AND f.attr_key = $2 FOR UPDATE OF f",
      [c, alias],
    );
    const rekeyed = await rekeyFacts(client, c, facts.map((f) => f.id), alias, canonical, plan.productIds);

    await client.query(
      `UPDATE attr_alias_proposals SET status = 'accepted', resolved_at = now(), resolution_note = $2, canonical_key = $3, rekeyed_facts = $4 WHERE id = $1`,
      [id, note, canonical, rekeyed],
    );
    await writeLog(client, {
      action: "attr_alias_accepted",
      subjectType: "attr_alias",
      subjectId: id,
      note: `${plan.aliasLabel} → ${plan.canonicalLabel} (수치 ${rekeyed}개 · 제품 ${plan.products}개)${note ? ` — ${note}` : ""}`,
      affected: rekeyed,
    });
    return { canonical, alias, rekeyed };
  });
}

export async function rejectProposal(id: string, note: string): Promise<void> {
  if (!ID.test(id)) throw notFound("성분 이름 제안");
  await tx(async (client) => {
    const { rows } = await client.query<{ label_a: string; label_b: string }>(
      "UPDATE attr_alias_proposals SET status = 'rejected', resolved_at = now(), resolution_note = $2 WHERE id = $1 AND status = 'open' RETURNING label_a, label_b",
      [id, note],
    );
    if (!rows[0]) throw new HttpError(409, "proposal_closed", "열린 제안이 아닙니다.");
    await writeLog(client, {
      action: "attr_alias_rejected",
      subjectType: "attr_alias",
      subjectId: id,
      note: `${rows[0].label_a} ↔ ${rows[0].label_b}${note ? ` — ${note}` : ""}`,
    });
  });
}

/**
 * 별칭 해제 (잘못 확정했거나 기본 사전의 묶음이 틀렸을 때). 표시 이름에서 원래 키를 다시 계산해
 * 그 이름으로 쓴 수치를 되돌린다 — 수치는 병합하지 않으므로 모두 되돌릴 수 있다.
 */
export async function removeAlias(categoryId: number, aliasKey: string, note: string): Promise<{ restored: number }> {
  if (!isAttrKey(aliasKey) || !Number.isInteger(categoryId)) throw notFound("성분명 별칭");
  return tx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [ATTR_ALIAS_LOCK]);
    const { rows } = await client.query<{ canonical_key: string; proposal_id: string | null; alias_label: string }>(
      "DELETE FROM attr_aliases WHERE category_id = $1 AND alias_key = $2 RETURNING canonical_key, proposal_id::text, alias_label",
      [categoryId, aliasKey],
    );
    if (!rows[0]) throw notFound("성분명 별칭");
    const canonical = rows[0].canonical_key;
    const { rows: facts } = await client.query<{ id: string; attribute: string; product_id: string }>(
      `SELECT f.id::text, f.attribute, f.product_id::text FROM product_facts f JOIN products pr ON pr.id = f.product_id
        WHERE pr.category_id = $1 AND f.attr_key = $2 FOR UPDATE OF f`,
      [categoryId, canonical],
    );
    const mine = facts.filter((f) => attrKey(f.attribute) === aliasKey);
    const restored = await rekeyFacts(client, categoryId, mine.map((f) => f.id), canonical, aliasKey, [...new Set(mine.map((f) => f.product_id))]);
    await writeLog(client, {
      action: "attr_alias_removed",
      subjectType: "attr_alias",
      subjectId: rows[0].proposal_id ?? `${categoryId}:${aliasKey}`,
      note: `${rows[0].alias_label} ↛ ${canonical}${rows[0].proposal_id ? "" : " (기본 사전)"} (되돌린 수치 ${restored})${note ? ` — ${note}` : ""}`,
      affected: restored,
    });
    return { restored };
  });
}

/** 제안 사유에 괴롭힘·권리침해가 있을 때 사유만 가린다 (공개 기록) */
export async function hideProposalReason(id: string, note: string): Promise<void> {
  if (!ID.test(id)) throw notFound("성분 이름 제안");
  await tx(async (client) => {
    const { rows } = await client.query<{ id: string }>("UPDATE attr_alias_proposals SET reason_hidden = true WHERE id = $1 RETURNING id::text", [id]);
    if (!rows[0]) throw notFound("성분 이름 제안");
    await writeLog(client, { action: "attr_alias_reason_hidden", subjectType: "attr_alias", subjectId: id, note });
  });
}
