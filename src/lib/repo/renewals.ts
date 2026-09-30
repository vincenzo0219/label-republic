/**
 * 제품 리뉴얼 기록 (Sprint 25).
 *
 * 판단은 src/lib/renewals.ts 의 detectEras 하나로 한다. 제품 페이지는 그 자리에서 계산하고(항상 최신),
 * 정리 배치가 같은 함수로 계산한 결과를 product_renewals 에 남긴다:
 *   - 성분 검색·순위(src/lib/repo/facts.ts)가 리뉴얼 전 글의 표시값을 빼는 기준
 *   - 관심 제품 알림("라벨이 바뀌었어요") — 처음 확인된 시각(confirmed_at)으로 센다
 * 운영자가 만들거나 지우지 않는다. 글이 블라인드되거나 정정 제안으로 값이 빠지면 다음 계산에서 사라진다.
 */
import type { PoolClient } from "pg";
import { productionTimeIndex } from "../label-dates";
import { fromBase } from "../products";
import { detectEras, renewalsOf, sameValue, type LabelReport } from "../renewals";
import { query } from "../db";
import { NOT_DISPUTED } from "./facts";
import { LABEL_DATE_MS, RENEWAL_AUTHOR } from "./products";
import { getRule } from "./rules";

const VISIBLE = "NOT p.is_blinded AND NOT p.is_suppressed";
/** 한 번에 계산하는 제품 수 */
const CHUNK = 200;
/** 전체 다시 계산 주기 (블라인드·광고 의심 전환처럼 시각이 남지 않는 변경을 반영) */
const FULL_SCAN_MS = 24 * 3600_000;

type ReportRow = {
  product_id: string; attr_key: string; basis_key: string; unit_group: string;
  attribute: string; basis: string; unit: string;
  post_id: string; at: number; base: number; author: string | null; photo: boolean;
  kind: "label" | "measured"; made: number | null; expires: number | null; board: string;
};

export type RenewalRow = {
  id: string; product_id: string; attr_key: string; basis_key: string; unit_group: string;
  attribute: string; basis: string; unit: string;
  old_base: number; new_base: number; status: "confirmed" | "pending";
  new_reports: number; new_authors: number; new_photos: number;
  last_old_at: string; first_new_at: string; confirmed_at: string | null;
  /** 이전 라벨 시기로 판단된 글 (Sprint 26) — 성분 순위가 이 글들의 값을 뺀다 */
  old_posts: string[];
  time_basis: "made" | "posted";
};

type Computed = Omit<RenewalRow, "id" | "confirmed_at" | "last_old_at" | "first_new_at"> & { last_old_at: number; first_new_at: number };

function mostCommon(xs: string[]): string {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/** 제품들의 표시값 제보를 항목 묶음별로 계산 (시점은 라벨 날짜로 추정한 제조 시각, Sprint 26) */
export function computeRenewals(rows: ReportRow[], minReports: number): Computed[] {
  const ptime = productionTimeIndex(rows);
  const timeOf = (r: ReportRow) => ptime.get(`${r.product_id}|${r.post_id}`)!;
  const groups = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const k = `${r.product_id}|${r.attr_key}|${r.basis_key}|${r.unit_group}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: Computed[] = [];
  for (const g of groups.values()) {
    const labels = g.filter((r) => r.kind === "label");
    if (labels.length < 2) continue;
    const reports: LabelReport[] = labels.map((r) => ({ post_id: r.post_id, at: timeOf(r).at, base: r.base, author: r.author, photo: r.photo }));
    const { eras, pending } = detectEras(reports, minReports);
    const dated = (postId: string) => ptime.get(`${g[0]!.product_id}|${postId}`)?.basis !== "posted";
    const head = g[0]!;
    const common = {
      product_id: head.product_id, attr_key: head.attr_key, basis_key: head.basis_key, unit_group: head.unit_group,
      attribute: mostCommon(g.map((r) => r.attribute)), basis: mostCommon(g.map((r) => r.basis)), unit: mostCommon(g.map((r) => r.unit)),
    };
    for (const [i, rn] of renewalsOf(eras).entries()) {
      const prev = eras[i]!;
      const next = eras[i + 1]!;
      // 이 리뉴얼 전 시기의 글 (표시값·실측값 모두) — 같은 글이 두 줄이어도 한 번
      const oldPosts = [...new Set(g.filter((r) => timeOf(r).at < next.start_at).map((r) => r.post_id))];
      out.push({
        ...common, old_base: rn.from, new_base: rn.to, status: "confirmed",
        new_reports: rn.new_n, new_authors: rn.new_authors, new_photos: rn.new_photos, last_old_at: rn.last_old_at, first_new_at: rn.first_new_at,
        old_posts: oldPosts,
        time_basis: dated(prev.post_ids[prev.post_ids.length - 1]!) && dated(next.post_ids[0]!) ? "made" : "posted",
      });
    }
    if (pending) {
      const lastEra = eras[eras.length - 1]!;
      out.push({
        ...common, old_base: pending.from, new_base: pending.to, status: "pending",
        new_reports: pending.n, new_authors: pending.authors, new_photos: pending.photos, last_old_at: lastEra.last_at, first_new_at: pending.first_at,
        old_posts: [],
        time_basis: dated(lastEra.post_ids[lastEra.post_ids.length - 1]!) && dated(pending.post_ids[0]!) ? "made" : "posted",
      });
    }
  }
  return out;
}

async function reportRows(client: PoolClient, productIds: string[]): Promise<ReportRow[]> {
  const { rows } = await client.query<ReportRow>(
    `SELECT f.product_id::text, f.attr_key, f.basis_key, f.unit_group, f.attribute, f.basis, f.unit,
            f.post_id::text, (extract(epoch FROM p.created_at) * 1000)::float8 AS at, f.base_value AS base,
            ${RENEWAL_AUTHOR} AS author, f.source_image_id IS NOT NULL AS photo, f.kind::text AS kind,
            ${LABEL_DATE_MS}, c.slug AS board
       FROM product_facts f JOIN posts p ON p.id = f.post_id
       JOIN post_products pp ON pp.post_id = f.post_id AND pp.product_id = f.product_id
       JOIN products pr ON pr.id = f.product_id JOIN categories c ON c.id = pr.category_id
      WHERE f.product_id = ANY($1::bigint[]) AND ${VISIBLE} AND ${NOT_DISPUTED}`,
    [productIds],
  );
  return rows;
}

const sameGroup = (a: Pick<Computed, "attr_key" | "basis_key" | "unit_group">, b: Pick<RenewalRow, "attr_key" | "basis_key" | "unit_group">) =>
  a.attr_key === b.attr_key && a.basis_key === b.basis_key && a.unit_group === b.unit_group;

/**
 * 제품들의 리뉴얼 기록을 다시 계산해 맞춘다. 같은 묶음·같은 옛 값/새 값(2% 안)이면 같은 기록으로 보고
 * 처음 확인된 시각을 유지한다 (알림이 두 번 가지 않게). 새로 "확인됨"이 된 기록 수를 돌려준다.
 */
export async function reconcileRenewals(client: PoolClient, productIds: string[], now = new Date()): Promise<number> {
  if (!productIds.length) return 0;
  const min = await getRule("renewal_min_reports");
  const computed = computeRenewals(await reportRows(client, productIds), min);
  const { rows: existing } = await client.query<RenewalRow>(
    `SELECT id::text, product_id::text, attr_key, basis_key, unit_group, old_base, new_base, status, confirmed_at
       FROM product_renewals WHERE product_id = ANY($1::bigint[])`,
    [productIds],
  );
  const used = new Set<string>();
  let newlyConfirmed = 0;
  for (const c of computed) {
    const match = existing.find(
      (e) => !used.has(e.id) && e.product_id === c.product_id && sameGroup(c, e) && sameValue(e.old_base, c.old_base) && sameValue(e.new_base, c.new_base),
    );
    const confirmNow = c.status === "confirmed" && (!match || match.status !== "confirmed");
    if (confirmNow) newlyConfirmed++;
    const vals = [
      c.attribute, c.basis, c.unit, c.old_base, c.new_base, c.status, c.new_reports, c.new_authors, c.new_photos,
      new Date(c.last_old_at).toISOString(), new Date(c.first_new_at).toISOString(), c.old_posts, c.time_basis,
    ];
    if (match) {
      used.add(match.id);
      await client.query(
        `UPDATE product_renewals SET attribute = $2, basis = $3, unit = $4, old_base = $5, new_base = $6, status = $7::varchar,
                new_reports = $8, new_authors = $9, new_photos = $10, last_old_at = $11, first_new_at = $12,
                old_posts = $13::bigint[], time_basis = $14,
                confirmed_at = CASE WHEN $7::varchar = 'confirmed' THEN coalesce(confirmed_at, $15::timestamptz) END, updated_at = $15::timestamptz
          WHERE id = $1`,
        [match.id, ...vals, now.toISOString()],
      );
    } else {
      await client.query(
        `INSERT INTO product_renewals (product_id, attr_key, basis_key, unit_group, attribute, basis, unit, old_base, new_base, status,
                new_reports, new_authors, new_photos, last_old_at, first_new_at, old_posts, time_basis, detected_at, confirmed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::varchar, $11, $12, $13, $14, $15, $16::bigint[], $17, $18::timestamptz,
                 CASE WHEN $10::varchar = 'confirmed' THEN $18::timestamptz END, $18::timestamptz)`,
        [c.product_id, c.attr_key, c.basis_key, c.unit_group, ...vals, now.toISOString()],
      );
    }
  }
  const stale = existing.filter((e) => !used.has(e.id)).map((e) => e.id);
  if (stale.length) await client.query("DELETE FROM product_renewals WHERE id = ANY($1::bigint[])", [stale]);
  return newlyConfirmed;
}

/**
 * 정리 배치: 지난번 이후 바뀐 제품(새 글·수정, 정정 제안 변화)만 다시 계산하고, 하루 한 번은 전체를 계산한다.
 */
export async function refreshRenewals(client: PoolClient, now = new Date()): Promise<{ products: number; confirmed: number; full: boolean }> {
  const { rows: st } = await client.query<{ scanned_until: Date; full_at: Date }>("SELECT scanned_until, full_at FROM renewal_scans WHERE id = 1");
  const state = st[0] ?? { scanned_until: new Date(0), full_at: new Date(0) };
  const full = now.getTime() - new Date(state.full_at).getTime() >= FULL_SCAN_MS;
  // 경계에서 같은 시각의 변경을 놓치지 않게 1분 겹쳐 본다
  const since = new Date(Math.min(new Date(state.scanned_until).getTime(), now.getTime()) - 60_000).toISOString();
  const { rows } = full
    ? await client.query<{ id: string }>(
        `SELECT DISTINCT product_id::text AS id FROM product_facts WHERE kind = 'label'
         UNION SELECT DISTINCT product_id::text FROM product_renewals`,
      )
    : await client.query<{ id: string }>(
        `SELECT DISTINCT f.product_id::text AS id FROM posts p JOIN product_facts f ON f.post_id = p.id
          WHERE f.kind = 'label' AND p.created_at > $1::timestamptz
         UNION SELECT DISTINCT f.product_id::text FROM posts p JOIN product_facts f ON f.post_id = p.id
          WHERE f.kind = 'label' AND p.updated_at > $1::timestamptz
         UNION SELECT DISTINCT c.fact_product_id::text FROM corrections c
          WHERE c.target = 'fact' AND c.fact_product_id IS NOT NULL
            AND (c.created_at > $1::timestamptz OR c.supported_at > $1::timestamptz OR c.resolved_at > $1::timestamptz)`,
        [since],
      );
  const ids = rows.map((r) => r.id);
  let confirmed = 0;
  for (let i = 0; i < ids.length; i += CHUNK) confirmed += await reconcileRenewals(client, ids.slice(i, i + CHUNK), now);
  await client.query(
    `UPDATE renewal_scans SET scanned_until = $1::timestamptz, full_at = CASE WHEN $2 THEN $1::timestamptz ELSE full_at END WHERE id = 1`,
    [now.toISOString(), full],
  );
  return { products: ids.length, confirmed, full };
}

export type RenewalNotice = { product_id: string; attribute: string; basis: string; unit: string; from: number; to: number; confirmed_at: string };

/** 관심 제품 알림: since 이후 처음 확인된 리뉴얼 (값은 표시 단위로) */
export async function renewalsSince(productIds: string[], since: Date): Promise<RenewalNotice[]> {
  if (!productIds.length) return [];
  const rows = await query<RenewalRow & { target: string }>(
    `SELECT pr.id::text AS target, r.attribute, r.basis, r.unit, r.old_base, r.new_base, r.confirmed_at
       FROM products pr JOIN product_renewals r ON r.product_id = coalesce(pr.merged_into, pr.id)
      WHERE pr.id = ANY($1::bigint[]) AND r.status = 'confirmed' AND r.confirmed_at > $2::timestamptz
      ORDER BY r.confirmed_at`,
    [productIds, since.toISOString()],
  );
  return rows.map((r) => ({
    product_id: r.target, attribute: r.attribute, basis: r.basis, unit: r.unit,
    from: fromBase(r.old_base, r.unit), to: fromBase(r.new_base, r.unit), confirmed_at: r.confirmed_at!,
  }));
}
