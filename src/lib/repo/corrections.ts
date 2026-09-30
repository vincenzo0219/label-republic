/**
 * 정정 제안 (Sprint 15). 규칙은 src/lib/corrections.ts, 효과(신뢰도 배지·제품 집계)는 DB 함수와 products.ts 에 있다.
 */
import type { PoolClient } from "pg";
import { isUniqueViolation, query, tx } from "../db";
import { HttpError, blinded, notFound } from "../errors";
import { hashPin } from "../password";
import { heuristicSpam, shouldSuppress } from "../moderation";
import { getRule, getRules } from "./rules";
import { formatValue } from "../products";
import { normalizeSourceUrl, type SourceKind } from "../sources";
import {
  isSupported,
  MAX_OPEN_PER_AUTHOR,
  MAX_OPEN_PER_POST,
  squash,
  type CorrectionTarget,
} from "../corrections";
import type { Correction } from "../types";
import { assertPin } from "./pin-guard";

const ID = /^\d{1,18}$/;
const OPEN = "status IN ('open', 'answered')";

// 제안한 수치·문장이 지금 글에 그대로 있는가
const TARGET_CURRENT = `CASE c.target
    WHEN 'fact' THEN EXISTS (
      SELECT 1 FROM product_facts f
       WHERE f.post_id = c.post_id AND f.product_id = c.fact_product_id AND f.attr_key = c.fact_attr_key
         AND f.kind = c.fact_kind AND f.value = c.fact_value AND f.unit = c.fact_unit AND f.basis = c.fact_basis)
    WHEN 'text' THEN strpos(regexp_replace(p.title || ' ' || p.body, '\\s+', ' ', 'g'), c.quote) > 0
    ELSE true END`;

const COLS = `c.id, c.post_id, c.nickname, c.target, c.quote, c.proposal, c.reason, c.source_url, c.source_host, c.source_kind,
  c.status, c.author_note, c.agree_count, c.disagree_count, c.is_supported, c.created_at, c.resolved_at`;

/** 글의 정정 제안 캐시 카운터를 다시 센다 (제안 추가·투표·상태 변경마다) */
async function refreshPostCounts(client: PoolClient, postId: string): Promise<void> {
  await client.query(
    `UPDATE posts SET
       correction_count = (SELECT count(*) FROM corrections WHERE post_id = $1 AND status <> 'withdrawn' AND NOT is_hidden),
       disputed_count   = (SELECT count(*) FROM corrections WHERE post_id = $1 AND ${OPEN} AND is_supported AND NOT is_hidden)
     WHERE id = $1`,
    [postId],
  );
}

export async function listCorrections(postId: string, fp?: string): Promise<{ items: Correction[]; hidden: number }> {
  if (!ID.test(postId)) return { items: [], hidden: 0 };
  const [items, hidden] = await Promise.all([
    query<Correction>(
      `SELECT ${COLS}, ${TARGET_CURRENT} AS target_current,
              coalesce((SELECT v.value FROM correction_votes v WHERE v.correction_id = c.id AND v.voter_fingerprint = $2), 0)::int AS my_vote
         FROM corrections c JOIN posts p ON p.id = c.post_id
        WHERE c.post_id = $1 AND NOT c.is_hidden AND NOT p.is_blinded
        -- 동의된 미반영 제안 → 검토 중 → 답변 → 반영 → 철회 순
        ORDER BY (c.${OPEN} AND c.is_supported) DESC, array_position(ARRAY['open','answered','applied','withdrawn']::correction_status[], c.status), c.id`,
      [postId, fp ?? ""],
    ),
    query<{ n: number }>("SELECT count(*)::int AS n FROM corrections WHERE post_id = $1 AND is_hidden", [postId]),
  ]);
  return { items, hidden: hidden[0]!.n };
}

async function getOne(id: string, fp = ""): Promise<Correction> {
  const rows = await query<Correction>(
    `SELECT ${COLS}, ${TARGET_CURRENT} AS target_current,
            coalesce((SELECT v.value FROM correction_votes v WHERE v.correction_id = c.id AND v.voter_fingerprint = $2), 0)::int AS my_vote
       FROM corrections c JOIN posts p ON p.id = c.post_id WHERE c.id = $1`,
    [id, fp],
  );
  return rows[0]!;
}

export type CreateCorrectionInput = {
  nickname: string;
  pin: string;
  target: CorrectionTarget;
  /** target = fact: 글 수치 목록에서의 순서 */
  factIndex?: number;
  /** target = text: 본문(또는 제목)에서 그대로 옮긴 문장 / other: 어디가 틀렸는지 */
  quote?: string;
  proposal: string;
  reason: string;
  sourceUrl?: string;
  fingerprint: string;
};

function bad(message: string) {
  return new HttpError(400, "invalid_correction", message);
}

export async function createCorrection(postId: string, input: CreateCorrectionInput): Promise<Correction> {
  if (!ID.test(postId)) throw notFound();
  // 정정 제안을 광고 통로로 쓰지 못하게 글과 같은 규칙 기반 검사
  if (shouldSuppress(heuristicSpam(input.proposal, `${input.reason}\n${input.quote ?? ""}`), await getRule("spam_suppress_score"))) {
    throw bad("광고·스팸으로 보이는 내용은 정정 제안으로 올릴 수 없습니다.");
  }
  let source: { url: string; host: string; kind: SourceKind } | null = null;
  if (input.sourceUrl?.trim()) {
    try {
      source = normalizeSourceUrl(input.sourceUrl);
    } catch (err) {
      throw bad(`근거 링크: ${(err as Error).message}`);
    }
  }
  const pwHash = await hashPin(input.pin);
  const id = await tx(async (client) => {
    const { rows: posts } = await client.query<{ is_blinded: boolean; title: string; body: string }>(
      "SELECT is_blinded, title, body FROM posts WHERE id = $1 FOR UPDATE",
      [postId],
    );
    const post = posts[0];
    if (!post) throw notFound();
    if (post.is_blinded) throw blinded();
    const { rows: open } = await client.query<{ total: number; mine: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE author_fingerprint = $2)::int AS mine
         FROM corrections WHERE post_id = $1 AND ${OPEN} AND NOT is_hidden`,
      [postId, input.fingerprint],
    );
    if (open[0]!.mine >= MAX_OPEN_PER_AUTHOR) throw new HttpError(429, "too_many_corrections", `한 글에 열어 둘 수 있는 정정 제안은 ${MAX_OPEN_PER_AUTHOR}건까지입니다.`);
    if (open[0]!.total >= MAX_OPEN_PER_POST) throw new HttpError(429, "too_many_corrections", "이 글에는 검토 중인 정정 제안이 너무 많습니다.");

    let quote = squash(input.quote ?? "");
    let fact: { product_id: string; attr_key: string; kind: string; value: string; unit: string; basis: string } | null = null;
    if (input.target === "fact") {
      type FactRow = { product_id: string; attr_key: string; kind: string; value: string; num: number; unit: string; basis: string; attribute: string; label: string };
      const { rows: facts } = await client.query<FactRow>(
        `SELECT f.product_id, f.attr_key, f.kind, f.value::text, f.value::float8 AS num, f.unit, f.basis, f.attribute,
                pr.brand || ' ' || pr.name AS label
           FROM product_facts f JOIN products pr ON pr.id = f.product_id WHERE f.post_id = $1 ORDER BY f.position`,
        [postId],
      );
      const f = facts[input.factIndex ?? -1];
      if (!f) throw bad("정정할 수치를 골라주세요.");
      fact = f;
      quote = `${f.label} · ${f.attribute} ${formatValue(f.num)} ${f.unit}${f.basis ? ` (${f.basis})` : ""} · ${f.kind === "label" ? "표시값" : "실측값"}`.slice(0, 300);
    } else if (input.target === "text") {
      if ([...quote].length < 5) throw bad("틀렸다고 생각하는 문장을 본문에서 5자 이상 그대로 옮겨주세요.");
      if (!squash(`${post.title} ${post.body}`).includes(quote)) throw bad("인용한 문장을 본문에서 찾을 수 없습니다. 본문에서 그대로 복사해 주세요.");
    } else if ([...quote].length < 2) {
      throw bad("어느 부분이 틀렸는지 적어주세요 (예: 제목, 3번째 사진 설명).");
    }

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO corrections (post_id, nickname, pw_hash, author_fingerprint, target, quote,
                                fact_product_id, fact_attr_key, fact_kind, fact_value, fact_unit, fact_basis,
                                proposal, reason, source_url, source_host, source_kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [
        postId, input.nickname, pwHash, input.fingerprint, input.target, quote.slice(0, 300),
        fact?.product_id ?? null, fact?.attr_key ?? null, fact?.kind ?? null, fact?.value ?? null, fact?.unit ?? null, fact?.basis ?? null,
        input.proposal, input.reason, source?.url ?? null, source?.host ?? null, source?.kind ?? null,
      ],
    );
    await refreshPostCounts(client, postId);
    return rows[0]!.id;
  });
  return getOne(id, input.fingerprint);
}

export type CorrectionVoteResult = Pick<Correction, "agree_count" | "disagree_count" | "is_supported" | "my_vote">;

/** 동의(1)·반대(-1). 같은 값을 다시 누르면 취소. 제안자와 글 작성자는 투표할 수 없다. */
export async function voteCorrection(id: string, fp: string, value: 1 | -1): Promise<CorrectionVoteResult> {
  if (!ID.test(id)) throw notFound("정정 제안");
  try {
    return await voteOnce(id, fp, value);
  } catch (err) {
    if (isUniqueViolation(err)) return voteOnce(id, fp, value);
    throw err;
  }
}

async function voteOnce(id: string, fp: string, value: 1 | -1): Promise<CorrectionVoteResult> {
  return tx(async (client) => {
    const { rows } = await client.query<{ post_id: string; author_fingerprint: string | null; status: string; is_hidden: boolean; post_author: string | null; is_blinded: boolean }>(
      `SELECT c.post_id, c.author_fingerprint, c.status, c.is_hidden, p.author_fingerprint AS post_author, p.is_blinded
         FROM corrections c JOIN posts p ON p.id = c.post_id WHERE c.id = $1 FOR UPDATE OF c`,
      [id],
    );
    const c = rows[0];
    if (!c || c.is_hidden) throw notFound("정정 제안");
    if (c.is_blinded) throw blinded();
    if (c.status === "withdrawn" || c.status === "applied") throw new HttpError(409, "correction_closed", "이미 닫힌 정정 제안입니다.");
    if (c.author_fingerprint === fp) throw new HttpError(403, "own_correction", "내가 올린 제안에는 투표할 수 없습니다.");
    if (c.post_author === fp) throw new HttpError(403, "own_post", "내 글에 대한 제안에는 투표 대신 답변해 주세요.");

    const existing = await client.query<{ value: number }>("SELECT value FROM correction_votes WHERE correction_id = $1 AND voter_fingerprint = $2", [id, fp]);
    let myVote: 1 | -1 | 0 = value;
    if (!existing.rows[0]) {
      // 갓 생긴 fingerprint(첫 활동 1시간 이내)의 표는 절반만 센다 — 동원된 새 표로 동의를 만들기 어렵게
      await client.query(
        `INSERT INTO correction_votes (correction_id, voter_fingerprint, value, weight)
         VALUES ($1, $2, $3, CASE WHEN coalesce((SELECT first_seen > now() - interval '1 hour' FROM fingerprints WHERE fingerprint = $2), true) THEN 0.5 ELSE 1 END)`,
        [id, fp, value],
      );
    } else if (existing.rows[0].value === value) {
      await client.query("DELETE FROM correction_votes WHERE correction_id = $1 AND voter_fingerprint = $2", [id, fp]);
      myVote = 0;
    } else {
      await client.query("UPDATE correction_votes SET value = $3 WHERE correction_id = $1 AND voter_fingerprint = $2", [id, fp, value]);
    }
    const { rows: agg } = await client.query<{ agree_count: number; disagree_count: number; agree_score: number; disagree_score: number }>(
      `SELECT count(*) FILTER (WHERE value = 1)::int AS agree_count, count(*) FILTER (WHERE value = -1)::int AS disagree_count,
              coalesce(sum(weight) FILTER (WHERE value = 1), 0)::float8 AS agree_score,
              coalesce(sum(weight) FILTER (WHERE value = -1), 0)::float8 AS disagree_score
         FROM correction_votes WHERE correction_id = $1`,
      [id],
    );
    const a = agg[0]!;
    const rules = await getRules();
    const supported = isSupported(a.agree_score, a.disagree_score, rules.correction_support_score, rules.correction_support_ratio);
    await client.query(
      `UPDATE corrections SET agree_count = $2, disagree_count = $3, agree_score = $4, disagree_score = $5, is_supported = $6,
              supported_at = CASE WHEN NOT $6 THEN NULL WHEN is_supported THEN supported_at ELSE now() END
        WHERE id = $1`,
      [id, a.agree_count, a.disagree_count, a.agree_score, a.disagree_score, supported],
    );
    await refreshPostCounts(client, c.post_id);
    return { agree_count: a.agree_count, disagree_count: a.disagree_count, is_supported: supported, my_vote: myVote };
  });
}

/**
 * 글 작성자의 응답 (글 비밀번호).
 *  - applied: 글을 고친 뒤에만. 수치·문장 제안이면 그 수치·문장이 글에서 바뀌었어야 한다 (말로만 "반영함" 방지)
 *  - answered: 반영하지 않는 이유. 동의된 제안이면 답변 후에도 자동 규칙은 그대로다
 */
export async function respondCorrection(id: string, fp: string, pin: string, action: "applied" | "answered", note: string): Promise<Correction> {
  if (!ID.test(id)) throw notFound("정정 제안");
  const rows = await query<{ post_id: string; status: string; is_hidden: boolean; created_at: string; pw_hash: string; updated_at: string; is_blinded: boolean; target_current: boolean }>(
    `SELECT c.post_id, c.status, c.is_hidden, c.created_at, p.pw_hash, p.updated_at, p.is_blinded, ${TARGET_CURRENT} AS target_current
       FROM corrections c JOIN posts p ON p.id = c.post_id WHERE c.id = $1`,
    [id],
  );
  const c = rows[0];
  if (!c || c.is_hidden) throw notFound("정정 제안");
  if (c.is_blinded) throw blinded();
  await assertPin(`post:${c.post_id}`, fp, pin, c.pw_hash);
  if (c.status === "withdrawn" || c.status === "applied") throw new HttpError(409, "correction_closed", "이미 닫힌 정정 제안입니다.");
  if (action === "applied") {
    if (new Date(c.updated_at) <= new Date(c.created_at)) {
      throw new HttpError(409, "not_edited", "글을 먼저 수정한 뒤 \"반영함\"을 눌러주세요.");
    }
    if (c.target_current) throw new HttpError(409, "not_edited", "제안된 수치·문장이 글에 그대로 있습니다. 글을 고친 뒤 눌러주세요.");
  } else if (!note.trim()) {
    throw bad("반영하지 않는 이유를 적어주세요.");
  }
  await tx(async (client) => {
    await client.query(
      `UPDATE corrections SET status = $2::correction_status, author_note = $3,
              resolved_at = CASE WHEN $2::correction_status = 'applied' THEN now() ELSE resolved_at END
        WHERE id = $1 AND status IN ('open', 'answered') AND NOT is_hidden`,
      [id, action, note.trim().slice(0, 300)],
    ).then((r) => {
      // 확인한 뒤 그 사이에 철회·반영·가려짐이 먼저 됐으면
      if (!r.rowCount) throw new HttpError(409, "correction_closed", "이미 닫힌 정정 제안입니다.");
    });
    await refreshPostCounts(client, c.post_id);
  });
  return getOne(id, fp);
}

/** 제안자 철회 (제안 비밀번호) */
export async function withdrawCorrection(id: string, fp: string, pin: string): Promise<Correction> {
  if (!ID.test(id)) throw notFound("정정 제안");
  const rows = await query<{ post_id: string; status: string; pw_hash: string }>("SELECT post_id, status, pw_hash FROM corrections WHERE id = $1", [id]);
  const c = rows[0];
  if (!c) throw notFound("정정 제안");
  await assertPin(`correction:${id}`, fp, pin, c.pw_hash);
  if (c.status === "withdrawn" || c.status === "applied") throw new HttpError(409, "correction_closed", "이미 닫힌 정정 제안입니다.");
  await tx(async (client) => {
    const r = await client.query("UPDATE corrections SET status = 'withdrawn', resolved_at = now() WHERE id = $1 AND status IN ('open', 'answered')", [id]);
    if (!r.rowCount) throw new HttpError(409, "correction_closed", "이미 닫힌 정정 제안입니다.");
    await refreshPostCounts(client, c.post_id);
  });
  return getOne(id, fp);
}

/** 신고 — 고유 신고 5건이면 자동으로 가린다 */
export async function reportCorrection(id: string, fp: string): Promise<{ report_count: number; is_hidden: boolean; alreadyReported: boolean }> {
  if (!ID.test(id)) throw notFound("정정 제안");
  return tx(async (client) => {
    const { rows } = await client.query<{ post_id: string; post_author: string | null }>(
      "SELECT c.post_id, p.author_fingerprint AS post_author FROM corrections c JOIN posts p ON p.id = c.post_id WHERE c.id = $1 FOR UPDATE OF c",
      [id],
    );
    if (!rows[0]) throw notFound("정정 제안");
    // 글 작성자가 자기 글에 달린 제안을 신고로 가리지 못하게 (반영하지 않으려면 답변을 남긴다)
    if (rows[0].post_author === fp) throw new HttpError(403, "own_post", "내 글에 대한 제안은 신고 대신 답변해 주세요.");
    const ins = await client.query(
      `INSERT INTO correction_reports (correction_id, reporter_fingerprint, weight)
       VALUES ($1, $2, CASE WHEN coalesce((SELECT first_seen > now() - interval '1 hour' FROM fingerprints WHERE fingerprint = $2), true) THEN 0.5 ELSE 1 END)
       ON CONFLICT DO NOTHING`,
      [id, fp],
    );
    // 가림: 고유 신고 N건 AND 가중치 합 N (커뮤니티 규칙 correction_hide_reports — 갓 생긴 이용자 동원으로 가리기 어렵게)
    const { rows: r } = await client.query<{ report_count: number; is_hidden: boolean }>(
      `WITH agg AS (SELECT count(*)::int AS n, coalesce(sum(weight), 0) AS w FROM correction_reports WHERE correction_id = $1)
       UPDATE corrections SET report_count = agg.n, is_hidden = is_hidden OR (agg.n >= $2 AND agg.w >= $2)
         FROM agg WHERE id = $1 RETURNING report_count, is_hidden`,
      [id, await getRule("correction_hide_reports")],
    );
    await refreshPostCounts(client, rows[0].post_id);
    return { ...r[0]!, alreadyReported: ins.rowCount === 0 };
  });
}
