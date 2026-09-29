/**
 * 브랜드 별칭 (Sprint 31) — "NOW Foods" 와 "나우푸드" 처럼 표기만 다른 같은 브랜드를 합친다.
 *
 * 방장 없는 원칙대로 운영자가 혼자 정하지 않는다:
 *  1. 이용자가 브랜드 페이지에서 "같은 브랜드" 제안 (이유 필수, 두 브랜드 모두 보이는 제품이 있어야 함)
 *  2. 이용자 동의·반대 — 정정 제안과 같은 "커뮤니티 동의" 기준(규칙 투표로 바뀜), 같은 접속 망의 표는 한 사람으로
 *  3. 동의된 제안만 운영자가 확정 (기각은 언제든) — 확정·기각·해제 모두 /transparency 에 공개
 *
 * 확정하면 제품이 많은 쪽이 대표 브랜드가 되고, 다른 쪽 제품의 정규화 키 앞부분을 대표 키로 바꾼다.
 * 같은 보드에 같은 이름의 제품이 이미 있으면 병합(제품 병합 기록도 따로 공개). 표시 이름(브랜드 표기)은 글쓴이가 쓴 그대로 둔다.
 */
import type { PoolClient } from "pg";
import { query, tx } from "../db";
import { isSupported } from "../corrections";
import { HttpError, notFound } from "../errors";
import { normText } from "../products";
import { mergeProductIn, writeLog } from "./operator";
import { getRules } from "./rules";

const ID = /^\d{1,18}$/;
const VISIBLE_POST = "NOT p.is_blinded AND NOT p.is_suppressed";
const VISIBLE_PRODUCT = `pr.merged_into IS NULL AND EXISTS (SELECT 1 FROM post_products pp JOIN posts p ON p.id = pp.post_id WHERE pp.product_id = pr.id AND ${VISIBLE_POST})`;

type Q = Pick<PoolClient, "query">;
const run = async <T>(c: Q | null, sql: string, args: unknown[]): Promise<T[]> =>
  c ? (await c.query(sql, args)).rows as T[] : query<T & Record<string, unknown>>(sql, args) as Promise<T[]>;

export function isBrandKey(key: string): boolean {
  return key.length > 0 && key.length <= 60 && normText(key) === key;
}

/** 별칭이면 대표 브랜드 키, 아니면 그대로 */
export async function canonicalBrandKey(key: string, client: Q | null = null): Promise<string> {
  const rows = await run<{ canonical_key: string }>(client, "SELECT canonical_key FROM brand_aliases WHERE alias_key = $1", [key]);
  return rows[0]?.canonical_key ?? key;
}

export type BrandInfo = { key: string; label: string; products: number };

/** 보이는 제품이 있는 브랜드의 대표 표기(가장 많이 쓴 표기)와 제품 수 */
async function brandInfo(key: string, client: Q | null = null): Promise<BrandInfo | null> {
  const rows = await run<BrandInfo>(
    client,
    `SELECT $1::text AS key, mode() WITHIN GROUP (ORDER BY pr.brand) AS label, count(*)::int AS products
       FROM products pr WHERE split_part(pr.norm_key, '|', 1) = $1 AND ${VISIBLE_PRODUCT}`,
    [key],
  );
  return rows[0] && rows[0].products > 0 ? rows[0] : null;
}

/** 제안 칸의 자동완성: 이름에 검색어가 들어간 브랜드 (보이는 제품이 있는 것만, 별칭 제외) */
export async function searchBrands(q: string, limit = 8): Promise<BrandInfo[]> {
  const t = normText(q.slice(0, 60));
  if (!t) return [];
  const like = `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return query<BrandInfo>(
    `SELECT split_part(pr.norm_key, '|', 1) AS key, mode() WITHIN GROUP (ORDER BY pr.brand) AS label, count(*)::int AS products
       FROM products pr
      WHERE split_part(pr.norm_key, '|', 1) LIKE $1 AND ${VISIBLE_PRODUCT}
      GROUP BY 1 ORDER BY length(split_part(pr.norm_key, '|', 1)), count(*) DESC LIMIT $2`,
    [like, limit],
  );
}

/** 이 브랜드로 합쳐진 다른 표기 */
export async function aliasesOf(canonical: string): Promise<{ key: string; label: string; created_at: string }[]> {
  return query(
    `SELECT a.alias_key AS key, a.created_at,
            coalesce((SELECT CASE WHEN p.brand_a = a.alias_key THEN p.label_a ELSE p.label_b END FROM brand_alias_proposals p WHERE p.id = a.proposal_id), a.alias_key) AS label
       FROM brand_aliases a WHERE a.canonical_key = $1 ORDER BY a.created_at`,
    [canonical],
  );
}

export type AliasProposal = {
  id: string;
  brand_a: string;
  brand_b: string;
  label_a: string;
  label_b: string;
  reason: string;
  nickname: string;
  status: "open" | "accepted" | "rejected";
  agree_count: number;
  disagree_count: number;
  is_supported: boolean;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string;
  canonical_key: string | null;
  merged_products: number;
  rekeyed_products: number;
  my_vote?: 1 | -1 | 0;
};

const COLS = `p.id::text, p.brand_a, p.brand_b, p.label_a, p.label_b, p.reason, p.nickname, p.status, p.agree_count, p.disagree_count,
  p.is_supported, p.created_at, p.resolved_at, p.resolution_note, p.canonical_key, p.merged_products, p.rekeyed_products`;

/** 브랜드 페이지: 이 브랜드(또는 이 브랜드로 합쳐진 별칭)가 들어간 제안 — 열린 것 먼저 */
export async function listProposals(brandKey: string, fp: string | null = null): Promise<AliasProposal[]> {
  return query<AliasProposal>(
    `WITH keys AS (SELECT $1::text AS k UNION SELECT alias_key FROM brand_aliases WHERE canonical_key = $1)
     SELECT ${COLS}, coalesce((SELECT v.value FROM brand_alias_votes v WHERE v.proposal_id = p.id AND v.voter_fingerprint = $2), 0)::int AS my_vote
       FROM brand_alias_proposals p
      WHERE p.brand_a IN (SELECT k FROM keys) OR p.brand_b IN (SELECT k FROM keys)
      ORDER BY (p.status = 'open') DESC, p.created_at DESC LIMIT 30`,
    [brandKey, fp],
  );
}

/** 운영자 화면: 열린 제안 (동의된 것 먼저) + 최근 확정된 별칭 */
export async function listForReview(): Promise<{ open: AliasProposal[]; aliases: { alias_key: string; canonical_key: string; label: string; canonical_label: string; created_at: string }[] }> {
  const [open, aliases] = await Promise.all([
    query<AliasProposal>(`SELECT ${COLS} FROM brand_alias_proposals p WHERE p.status = 'open' ORDER BY p.is_supported DESC, p.created_at LIMIT 50`),
    query<{ alias_key: string; canonical_key: string; label: string; canonical_label: string; created_at: string }>(
      `SELECT a.alias_key, a.canonical_key, a.created_at,
              coalesce(CASE WHEN p.brand_a = a.alias_key THEN p.label_a ELSE p.label_b END, a.alias_key) AS label,
              coalesce(CASE WHEN p.brand_a = a.canonical_key THEN p.label_a WHEN p.brand_b = a.canonical_key THEN p.label_b END, a.canonical_key) AS canonical_label
         FROM brand_aliases a LEFT JOIN brand_alias_proposals p ON p.id = a.proposal_id
        ORDER BY a.created_at DESC LIMIT 50`,
    ),
  ]);
  return { open, aliases };
}

export const MAX_PROPOSALS_PER_DAY = 5;

/**
 * "이 브랜드와 저 브랜드는 같은 브랜드" 제안. 둘 다 별칭이면 대표 키로 바꿔 비교하고,
 * 이미 같은 브랜드이거나 같은 두 브랜드의 열린 제안이 있으면 거절한다.
 */
export async function createProposal(input: {
  brandKey: string;
  other: string;
  reason: string;
  nickname: string;
  fingerprint: string;
  net: string | null;
}): Promise<AliasProposal> {
  const otherKey = normText(input.other).slice(0, 60);
  if (!isBrandKey(input.brandKey) || !otherKey) throw new HttpError(400, "invalid_brand", "브랜드를 확인하세요.");
  return tx(async (client) => {
    const [a0, b0] = [await canonicalBrandKey(input.brandKey, client), await canonicalBrandKey(otherKey, client)];
    if (a0 === b0) throw new HttpError(409, "already_same", "이미 같은 브랜드로 묶여 있습니다.");
    const [ia, ib] = [await brandInfo(a0, client), await brandInfo(b0, client)];
    if (!ia || !ib) throw new HttpError(404, "brand_not_found", "보이는 제품이 있는 브랜드끼리만 제안할 수 있습니다.");
    // 순서 없는 쌍은 UTF-8 바이트 순서로 (DB 의 CHECK ... COLLATE "C" 와 같게 — 로캘마다 한글·영문 순서가 다르다)
    const [x, y] = Buffer.compare(Buffer.from(a0), Buffer.from(b0)) < 0 ? [ia, ib] : [ib, ia];
    // 제안 도배 방지: 한 사람·한 망이 하루에 여러 건 (Sprint 29 원칙: 식별값만이 아니라 망 기준도)
    const recent = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM brand_alias_proposals
        WHERE created_at > now() - interval '1 day' AND (proposer_fingerprint = $1 OR ($2::text IS NOT NULL AND proposer_net = $2))`,
      [input.fingerprint, input.net],
    );
    if (recent.rows[0]!.n >= MAX_PROPOSALS_PER_DAY) throw new HttpError(429, "rate_limited", "브랜드 제안은 하루에 5건까지 올릴 수 있어요.");
    const ins = await client.query<{ id: string }>(
      `INSERT INTO brand_alias_proposals (brand_a, brand_b, label_a, label_b, reason, nickname, proposer_fingerprint, proposer_net)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (brand_a, brand_b) WHERE status = 'open' DO NOTHING RETURNING id::text`,
      [x.key, y.key, x.label.slice(0, 60), y.label.slice(0, 60), input.reason, input.nickname, input.fingerprint, input.net],
    );
    if (!ins.rows[0]) throw new HttpError(409, "proposal_exists", "같은 두 브랜드에 대한 제안이 이미 열려 있어요. 그 제안에 동의해 주세요.");
    const { rows } = await client.query<AliasProposal>(`SELECT ${COLS}, 0 AS my_vote FROM brand_alias_proposals p WHERE p.id = $1`, [ins.rows[0].id]);
    return rows[0]!;
  });
}

export type AliasVoteResult = Pick<AliasProposal, "agree_count" | "disagree_count" | "is_supported"> & { my_vote: 1 | -1 | 0 };

/** 동의(1)·반대(-1), 같은 값을 다시 누르면 취소. 제안자는 투표할 수 없다. 같은 망의 표는 가장 큰 가중치 하나만 센다 */
export async function voteProposal(id: string, fp: string, net: string | null, value: 1 | -1): Promise<AliasVoteResult> {
  if (!ID.test(id)) throw notFound("브랜드 제안");
  return tx(async (client) => {
    const { rows } = await client.query<{ status: string; proposer_fingerprint: string | null }>(
      "SELECT status, proposer_fingerprint FROM brand_alias_proposals WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!rows[0]) throw notFound("브랜드 제안");
    if (rows[0].status !== "open") throw new HttpError(409, "proposal_closed", "이미 처리된 제안입니다.");
    if (rows[0].proposer_fingerprint === fp) throw new HttpError(403, "own_proposal", "내가 올린 제안에는 투표할 수 없습니다.");
    const existing = await client.query<{ value: number }>("SELECT value FROM brand_alias_votes WHERE proposal_id = $1 AND voter_fingerprint = $2", [id, fp]);
    let myVote: 1 | -1 | 0 = value;
    if (!existing.rows[0]) {
      // 갓 생긴 식별값(첫 활동 1시간 이내)의 표는 절반 (정정 제안과 같게)
      await client.query(
        `INSERT INTO brand_alias_votes (proposal_id, voter_fingerprint, voter_net, value, weight)
         VALUES ($1, $2, $3, $4, CASE WHEN coalesce((SELECT first_seen > now() - interval '1 hour' FROM fingerprints WHERE fingerprint = $2), true) THEN 0.5 ELSE 1 END)`,
        [id, fp, net, value],
      );
    } else if (existing.rows[0].value === value) {
      await client.query("DELETE FROM brand_alias_votes WHERE proposal_id = $1 AND voter_fingerprint = $2", [id, fp]);
      myVote = 0;
    } else {
      await client.query("UPDATE brand_alias_votes SET value = $3 WHERE proposal_id = $1 AND voter_fingerprint = $2", [id, fp, value]);
    }
    // 같은 망(또는 망 정보가 없으면 같은 식별값)의 같은 쪽 표는 하나로
    const { rows: agg } = await client.query<{ agree_count: number; disagree_count: number; agree_score: number; disagree_score: number }>(
      `SELECT count(*) FILTER (WHERE value = 1)::int AS agree_count, count(*) FILTER (WHERE value = -1)::int AS disagree_count,
              coalesce(sum(w) FILTER (WHERE value = 1), 0)::float8 AS agree_score, coalesce(sum(w) FILTER (WHERE value = -1), 0)::float8 AS disagree_score
         FROM (SELECT value, max(weight) AS w FROM brand_alias_votes WHERE proposal_id = $1
                GROUP BY value, coalesce(voter_net, voter_fingerprint)) g`,
      [id],
    );
    const a = agg[0]!;
    const rules = await getRules();
    const supported = isSupported(a.agree_score, a.disagree_score, rules.correction_support_score, rules.correction_support_ratio);
    await client.query(
      `UPDATE brand_alias_proposals SET agree_count = $2, disagree_count = $3, agree_score = $4, disagree_score = $5, is_supported = $6,
              supported_at = CASE WHEN NOT $6 THEN NULL WHEN is_supported THEN supported_at ELSE now() END
        WHERE id = $1`,
      [id, a.agree_count, a.disagree_count, a.agree_score, a.disagree_score, supported],
    );
    return { agree_count: a.agree_count, disagree_count: a.disagree_count, is_supported: supported, my_vote: myVote };
  });
}

export type AcceptResult = { canonical: string; alias: string; merged: number; rekeyed: number };

/**
 * 운영자 확정 (동의된 제안만). 제품이 많은 쪽이 대표(같으면 먼저 생긴 쪽).
 * 별칭 쪽 제품 키를 대표 키로 바꾸고, 같은 보드에 같은 이름 제품이 있으면 병합한다.
 */
export async function acceptProposal(id: string, note: string): Promise<AcceptResult> {
  if (!ID.test(id)) throw notFound("브랜드 제안");
  return tx(async (client) => {
    const { rows } = await client.query<{ brand_a: string; brand_b: string; label_a: string; label_b: string; status: string; is_supported: boolean }>(
      "SELECT brand_a, brand_b, label_a, label_b, status, is_supported FROM brand_alias_proposals WHERE id = $1 FOR UPDATE",
      [id],
    );
    const p = rows[0];
    if (!p) throw notFound("브랜드 제안");
    if (p.status !== "open") throw new HttpError(409, "proposal_closed", "이미 처리된 제안입니다.");
    if (!p.is_supported) throw new HttpError(409, "not_supported", "커뮤니티 동의를 얻은 제안만 확정할 수 있습니다.");
    // 확정은 한 번에 하나씩 (별칭 표가 동시에 바뀌지 않게)
    await client.query("SELECT pg_advisory_xact_lock(4823031)");
    const a = await canonicalBrandKey(p.brand_a, client);
    const b = await canonicalBrandKey(p.brand_b, client);
    if (a === b) throw new HttpError(409, "already_same", "이미 같은 브랜드로 묶여 있습니다.");
    const size = await client.query<{ key: string; n: number; first: string }>(
      `SELECT split_part(pr.norm_key, '|', 1) AS key, count(*) FILTER (WHERE ${VISIBLE_PRODUCT})::int AS n, min(pr.id)::text AS first
         FROM products pr WHERE split_part(pr.norm_key, '|', 1) = ANY($1::text[]) GROUP BY 1`,
      [[a, b]],
    );
    const info = (k: string) => size.rows.find((r) => r.key === k) ?? { key: k, n: 0, first: "9".repeat(18) };
    const [ia, ib] = [info(a), info(b)];
    const aWins = ia.n !== ib.n ? ia.n > ib.n : BigInt(ia.first) <= BigInt(ib.first);
    const canonical = aWins ? a : b;
    const alias = aWins ? b : a;
    const label = (k: string) => (k === p.brand_a ? p.label_a : k === p.brand_b ? p.label_b : k);

    // 별칭의 별칭도 새 대표를 가리키게 (한 단계로 펴 둔다)
    await client.query("UPDATE brand_aliases SET canonical_key = $2 WHERE canonical_key = $1", [alias, canonical]);
    await client.query("INSERT INTO brand_aliases (alias_key, canonical_key, proposal_id) VALUES ($1, $2, $3)", [alias, canonical, id]);

    let merged = 0;
    let rekeyed = 0;
    const products = await client.query<{ id: string; category_id: number; norm_key: string; merged_into: string | null }>(
      "SELECT id::text, category_id, norm_key, merged_into::text FROM products WHERE split_part(norm_key, '|', 1) = $1 ORDER BY id FOR UPDATE",
      [alias],
    );
    for (const pr of products.rows) {
      const newKey = `${canonical}|${pr.norm_key.slice(pr.norm_key.indexOf("|") + 1)}`;
      const same = await client.query<{ id: string; merged_into: string | null }>(
        "SELECT id::text, merged_into::text FROM products WHERE category_id = $1 AND norm_key = $2",
        [pr.category_id, newKey],
      );
      if (!same.rows[0]) {
        await client.query("UPDATE products SET norm_key = $2 WHERE id = $1", [pr.id, newKey]);
        rekeyed++;
      } else if (!pr.merged_into) {
        // 대표 브랜드에 같은 이름 제품이 있다 → 그 제품으로 병합 (병합 기록도 공개)
        const target = same.rows[0].merged_into ?? same.rows[0].id;
        if (target === pr.id) continue;
        await mergeProductIn(client, pr.id, target, `브랜드 별칭 확정 (제안 #${id}): ${label(alias)} → ${label(canonical)}`);
        merged++;
      }
      // 이미 병합된 제품은 키를 그대로 둔다 (주소는 합쳐진 제품으로 이어짐)
    }

    await client.query(
      `UPDATE brand_alias_proposals SET status = 'accepted', resolved_at = now(), resolution_note = $2, canonical_key = $3,
              merged_products = $4, rekeyed_products = $5 WHERE id = $1`,
      [id, note, canonical, merged, rekeyed],
    );
    await writeLog(client, {
      action: "brand_alias_accepted",
      subjectType: "brand_alias",
      subjectId: id,
      note: `${label(alias)} → ${label(canonical)} (제품 병합 ${merged} · 합친 제품 ${rekeyed})${note ? ` — ${note}` : ""}`,
      affected: merged + rekeyed,
    });
    return { canonical, alias, merged, rekeyed };
  });
}

export async function rejectProposal(id: string, note: string): Promise<void> {
  if (!ID.test(id)) throw notFound("브랜드 제안");
  await tx(async (client) => {
    const { rows } = await client.query<{ label_a: string; label_b: string }>(
      "UPDATE brand_alias_proposals SET status = 'rejected', resolved_at = now(), resolution_note = $2 WHERE id = $1 AND status = 'open' RETURNING label_a, label_b",
      [id, note],
    );
    if (!rows[0]) throw new HttpError(409, "proposal_closed", "열린 제안이 아닙니다.");
    await writeLog(client, {
      action: "brand_alias_rejected",
      subjectType: "brand_alias",
      subjectId: id,
      note: `${rows[0].label_a} ↔ ${rows[0].label_b}${note ? ` — ${note}` : ""}`,
    });
  });
}

/**
 * 별칭 해제 (잘못 확정했을 때). 앞으로 새로 태그되는 제품은 따로 잡히고, 키만 바꿨던 제품은 원래 키로 되돌린다
 * (그 사이 같은 이름 제품이 생겼으면 그대로 둔다). 확정 때 병합된 제품은 되돌리지 않는다 — 해제 기록에 그 수를 남긴다.
 */
export async function removeAlias(aliasKey: string, note: string): Promise<{ restored: number }> {
  if (!isBrandKey(aliasKey)) throw notFound("브랜드 별칭");
  return tx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(4823031)");
    const { rows } = await client.query<{ canonical_key: string; proposal_id: string | null }>(
      "DELETE FROM brand_aliases WHERE alias_key = $1 RETURNING canonical_key, proposal_id::text",
      [aliasKey],
    );
    if (!rows[0]) throw notFound("브랜드 별칭");
    const canonical = rows[0].canonical_key;
    const products = await client.query<{ id: string; category_id: number; brand: string; norm_key: string }>(
      "SELECT id::text, category_id, brand, norm_key FROM products WHERE split_part(norm_key, '|', 1) = $1 AND merged_into IS NULL ORDER BY id FOR UPDATE",
      [canonical],
    );
    let restored = 0;
    for (const pr of products.rows) {
      if (normText(pr.brand) !== aliasKey) continue;
      const oldKey = `${aliasKey}|${pr.norm_key.slice(pr.norm_key.indexOf("|") + 1)}`;
      const clash = await client.query("SELECT 1 FROM products WHERE category_id = $1 AND norm_key = $2", [pr.category_id, oldKey]);
      if (clash.rows[0]) continue;
      await client.query("UPDATE products SET norm_key = $2 WHERE id = $1", [pr.id, oldKey]);
      restored++;
    }
    const merged = rows[0].proposal_id
      ? (await client.query<{ merged_products: number }>("SELECT merged_products FROM brand_alias_proposals WHERE id = $1", [rows[0].proposal_id])).rows[0]?.merged_products ?? 0
      : 0;
    await writeLog(client, {
      action: "brand_alias_removed",
      subjectType: "brand_alias",
      subjectId: rows[0].proposal_id ?? aliasKey,
      note: `${aliasKey} ↛ ${canonical} (되돌린 제품 ${restored}${merged ? ` · 확정 때 병합된 제품 ${merged}개는 그대로` : ""})${note ? ` — ${note}` : ""}`,
      affected: restored,
    });
    return { restored };
  });
}
