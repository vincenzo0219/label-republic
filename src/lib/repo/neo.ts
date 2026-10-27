/**
 * 💳 넣어둬 (10/27 대표님). 살까 말까 고민되는 물건을 익명으로 올리면 모르는 사람들이 24시간 동안 "🛒 사라 / 💳 넣어둬" 투표.
 * 방 밖에 있다 (홈 맨 앞 버튼, /neo). AI 판결 없음. 결과는 내가 투표했거나 마감된 뒤에만 보인다 (먼저 본 숫자에 휩쓸리지 않게).
 * 마감 뒤 올린 사람이 "샀어요 / 넣어뒀어요"를 고르면 넣어둔 금액이 모두의 "넣어둬로 지킨 돈"에 쌓인다.
 * 가입 없이 방문자 쿠키(해시)로 글쓴이·투표자를 알아본다. 신고 3번이면 가린다.
 */
import { heuristicAbuse } from "../abuse";
import { query, tx } from "../db";
import { HttpError, notFound } from "../errors";
import { tokenOk } from "./images";

export type NeoChoice = "buy" | "keep";
export type NeoOutcome = "bought" | "kept";
export const NEO_HIDE_REPORTS = 3;
export const NEO_DAILY_POSTS = 5;

export type NeoItem = {
  id: string;
  title: string;
  price: number;
  reason: string;
  /** 대안 (예: 중고로, 세일 기다리기) */
  alt: string;
  /** 사진 1장 (101) */
  photo_id: string | null;
  created_at: string;
  closes_at: string;
  closed: boolean;
  outcome: NeoOutcome | null;
  /** 내가 투표했거나 마감됐을 때만 숫자 */
  tally: { buy: number; keep: number } | null;
  mine: NeoChoice | null;
  owner: boolean;
};

type Row = {
  id: string; title: string; price: number; reason: string; alt: string; photo_id: string | null; created_at: string; closes_at: string; closed: boolean;
  outcome: NeoOutcome | null; buy_count: number; keep_count: number; mine: NeoChoice | null; owner: boolean;
};

const COLS = (v: string) => `i.id::text, i.title, i.price, i.reason, i.alt, i.photo_id::text, i.created_at, i.closes_at, (i.closes_at <= now()) AS closed,
  i.outcome, i.buy_count, i.keep_count, i.owner_hash = ${v} AS owner,
  (SELECT choice FROM neo_votes nv WHERE nv.item_id = i.id AND nv.visitor_hash = ${v}) AS mine`;

function shape(r: Row): NeoItem {
  const show = r.closed || !!r.mine || r.owner;
  return {
    id: r.id, title: r.title, price: r.price, reason: r.reason, alt: r.alt, photo_id: r.photo_id, created_at: r.created_at, closes_at: r.closes_at, closed: r.closed,
    outcome: r.outcome, tally: show ? { buy: r.buy_count, keep: r.keep_count } : null, mine: r.mine, owner: r.owner,
  };
}

/** 링크·전화번호·SNS 아이디는 받지 않는다 (광고·거래 글 막기) */
export function neoTextProblem(...texts: string[]): string | null {
  const t = texts.join("\n");
  if (/https?:\/\/|www\.|\.(com|kr|net|co|io|me|ly)\b/i.test(t)) return "링크는 넣을 수 없어요. 물건 이름만 적어 주세요.";
  if (/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|카톡|오픈채팅|텔레그램|@[a-z0-9_.]{3,}/i.test(t)) return "연락처·아이디는 넣을 수 없어요.";
  if (heuristicAbuse(...texts)) return "욕설·비하 표현은 쓸 수 없어요.";
  return null;
}

export async function createNeo(input: {
  title: string; price: number; reason: string; alt?: string; owner: string; fingerprint: string;
  /** /api/uploads 가 준 id·token (사진이 있으면 이름은 비워도 된다) */
  photo?: { id: string; token: string } | null;
}): Promise<NeoItem> {
  if (input.title.trim().length < 2 && !input.photo) throw new HttpError(400, "invalid_input", "사진을 넣거나 물건 이름을 2자 이상 적어 주세요.");
  if (input.photo && !tokenOk(input.photo.id, input.photo.token)) throw new HttpError(400, "invalid_image", "사진을 다시 올려 주세요.");
  const problem = neoTextProblem(input.title, input.reason, input.alt ?? "");
  if (problem) throw new HttpError(400, "invalid_input", problem);
  const [{ n }] = (await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM neo_items WHERE (owner_hash = $1 OR fingerprint = $2) AND created_at > now() - interval '24 hours'",
    [input.owner, input.fingerprint],
  )) as [{ n: number }];
  if (n >= NEO_DAILY_POSTS) throw new HttpError(429, "rate_limited", `하루에 ${NEO_DAILY_POSTS}개까지 올릴 수 있어요.`);
  const id = await tx(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "INSERT INTO neo_items (title, price, reason, alt, owner_hash, fingerprint, photo_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text",
      [input.title.trim(), input.price, input.reason, input.alt ?? "", input.owner, input.fingerprint, input.photo?.id ?? null],
    );
    if (input.photo) {
      // 아직 아무 데도 안 붙은 내 업로드만
      const got = await c.query("UPDATE post_images SET neo_id = $2, attached_at = now() WHERE id = $1 AND post_id IS NULL AND neo_id IS NULL RETURNING id", [input.photo.id, rows[0]!.id]);
      if (!got.rowCount) throw new HttpError(400, "invalid_image", "사진을 다시 올려 주세요.");
    }
    return rows[0]!.id;
  });
  return (await getNeo(id, input.owner))!;
}

export async function getNeo(id: string, visitor: string): Promise<NeoItem | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const [r] = await query<Row>(`SELECT ${COLS("$2")} FROM neo_items i WHERE i.id = $1 AND NOT i.is_hidden`, [id, visitor]);
  return r ? shape(r) : null;
}

/** 진행 중(마감 가까운 순) + 최근 마감 */
export async function listNeo(visitor: string, opts: { limit?: number } = {}): Promise<{ open: NeoItem[]; closed: NeoItem[] }> {
  const limit = Math.min(opts.limit ?? 30, 60);
  const open = await query<Row>(
    `SELECT ${COLS("$1")} FROM neo_items i WHERE NOT i.is_hidden AND i.closes_at > now() ORDER BY i.created_at DESC LIMIT $2`,
    [visitor, limit],
  );
  const closed = await query<Row>(
    `SELECT ${COLS("$1")} FROM neo_items i WHERE NOT i.is_hidden AND i.closes_at <= now() ORDER BY i.closes_at DESC LIMIT $2`,
    [visitor, Math.min(limit, 20)],
  );
  return { open: open.map(shape), closed: closed.map(shape) };
}

/** 투표 (마감 전, 바꾸기 가능). 내 글에는 투표하지 않는다 */
export async function voteNeo(id: string, visitor: string, choice: NeoChoice): Promise<NeoItem> {
  await tx(async (c) => {
    const { rows } = await c.query<{ open: boolean; owner: boolean }>(
      "SELECT closes_at > now() AS open, owner_hash = $2 AS owner FROM neo_items WHERE id = $1 AND NOT is_hidden FOR UPDATE",
      [id, visitor],
    );
    const it = rows[0];
    if (!it) throw notFound("넣어둬 글");
    if (!it.open) throw new HttpError(409, "closed", "투표가 끝났어요.");
    if (it.owner) throw new HttpError(403, "own_item", "내 글에는 투표할 수 없어요.");
    const prev = await c.query<{ choice: NeoChoice }>("SELECT choice FROM neo_votes WHERE item_id = $1 AND visitor_hash = $2", [id, visitor]);
    const before = prev.rows[0]?.choice ?? null;
    if (before === choice) return;
    await c.query(
      `INSERT INTO neo_votes (item_id, visitor_hash, choice) VALUES ($1, $2, $3)
       ON CONFLICT (item_id, visitor_hash) DO UPDATE SET choice = EXCLUDED.choice, created_at = now()`,
      [id, visitor, choice],
    );
    const col = (x: NeoChoice) => (x === "buy" ? "buy_count" : "keep_count");
    await c.query(
      `UPDATE neo_items SET ${col(choice)} = ${col(choice)} + 1${before ? `, ${col(before)} = GREATEST(0, ${col(before)} - 1)` : ""} WHERE id = $1`,
      [id],
    );
  });
  return (await getNeo(id, visitor))!;
}

/**
 * 글쓴이가 고른다: 마감 뒤 샀어요 / 넣어뒀어요 (바꾸기 가능).
 * 투표 중 "안 살래요"(kept)는 바로 마감하고 넣어둔 것으로 (중국 「真要买吗」처럼 기다리다 마음이 식으면 스스로 철회)
 */
export async function setNeoOutcome(id: string, visitor: string, outcome: NeoOutcome): Promise<NeoItem> {
  const rows = await query<{ closed: boolean }>(
    "SELECT closes_at <= now() AS closed FROM neo_items WHERE id = $1 AND owner_hash = $2 AND NOT is_hidden",
    [id, visitor],
  );
  if (!rows[0]) throw notFound("내 넣어둬 글");
  if (!rows[0].closed && outcome === "bought") throw new HttpError(409, "not_closed", "투표가 끝난 뒤에 고를 수 있어요.");
  await query("UPDATE neo_items SET outcome = $2, outcome_at = now(), closes_at = LEAST(closes_at, now()) WHERE id = $1", [id, outcome]);
  return (await getNeo(id, visitor))!;
}

export async function deleteNeo(id: string, visitor: string): Promise<void> {
  const rows = await query("DELETE FROM neo_items WHERE id = $1 AND owner_hash = $2 RETURNING id", [id, visitor]);
  if (!rows.length) throw notFound("내 넣어둬 글");
}

/** 신고: 한 사람 한 번, NEO_HIDE_REPORTS 번이면 가린다 */
export async function reportNeo(id: string, visitor: string): Promise<{ hidden: boolean }> {
  return tx(async (c) => {
    const ins = await c.query("INSERT INTO neo_reports (item_id, visitor_hash) SELECT id, $2 FROM neo_items WHERE id = $1 ON CONFLICT DO NOTHING RETURNING item_id", [id, visitor]);
    if (!ins.rowCount) {
      const ex = await c.query("SELECT 1 FROM neo_items WHERE id = $1", [id]);
      if (!ex.rowCount) throw notFound("넣어둬 글");
    }
    const r = await c.query<{ is_hidden: boolean }>(
      `UPDATE neo_items SET report_count = (SELECT count(*) FROM neo_reports WHERE item_id = $1),
         is_hidden = is_hidden OR (SELECT count(*) FROM neo_reports WHERE item_id = $1) >= $2
       WHERE id = $1 RETURNING is_hidden`,
      [id, NEO_HIDE_REPORTS],
    );
    return { hidden: !!r.rows[0]?.is_hidden };
  });
}

/** 💳 넣어둬로 지킨 돈: 마감 뒤 "넣어뒀어요"를 고른 글의 금액 합 */
export async function neoSaved(): Promise<{ won: number; count: number }> {
  const [r] = await query<{ won: string; count: number }>(
    "SELECT COALESCE(sum(price), 0)::text AS won, count(*)::int AS count FROM neo_items WHERE outcome = 'kept' AND NOT is_hidden",
  );
  return { won: Number(r?.won ?? 0), count: r?.count ?? 0 };
}
