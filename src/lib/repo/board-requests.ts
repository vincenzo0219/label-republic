import { query, tx, isUniqueViolation } from "../db";
import { config } from "../config";
import { HttpError, notFound } from "../errors";
import { slugify } from "../slug";
import type { BoardRequest } from "../types";

const SELECT = `
  SELECT r.id, r.requested_name, r.description, r.vote_count, r.status, r.created_at,
         c.slug AS promoted_category_slug
    FROM board_requests r LEFT JOIN categories c ON c.id = r.promoted_category_id`;

export async function listBoardRequests(): Promise<BoardRequest[]> {
  return query<BoardRequest>(`${SELECT} ORDER BY (r.status = 'open') DESC, r.vote_count DESC, r.id DESC LIMIT 100`);
}

export async function createBoardRequest(name: string, description: string): Promise<BoardRequest> {
  const exists = await query("SELECT 1 FROM categories WHERE lower(name) = lower($1) OR slug = $2", [name, slugify(name)]);
  if (exists.length) throw new HttpError(409, "already_exists", "이미 존재하는 보드입니다.");
  try {
    const rows = await query<{ id: string }>(
      "INSERT INTO board_requests (requested_name, description) VALUES ($1, $2) RETURNING id",
      [name, description],
    );
    return (await query<BoardRequest>(`${SELECT} WHERE r.id = $1`, [rows[0]!.id]))[0]!;
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "already_requested", "같은 이름의 개설 요청이 이미 진행 중입니다. 그 요청에 투표해주세요.");
    throw err;
  }
}

export type BoardVoteResult = { request: BoardRequest; alreadyVoted: boolean; promoted: boolean; threshold: number };

/**
 * 보드 개설 요청 투표. vote_count가 임계치에 도달하면 사람 승인 없이 categories로 자동 승격한다.
 * 요청 행을 FOR UPDATE로 잠가 동시 투표에서도 승격이 정확히 한 번만 일어나게 한다.
 */
export async function voteBoardRequest(id: string, fp: string, threshold = config.boardPromotionThreshold): Promise<BoardVoteResult> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("보드 요청");
  const outcome = await tx(async (client) => {
    const req = await client.query<{ requested_name: string; description: string; status: string; vote_count: number }>(
      "SELECT requested_name, description, status, vote_count FROM board_requests WHERE id = $1 FOR UPDATE",
      [id],
    );
    const row = req.rows[0];
    if (!row) throw notFound("보드 요청");
    if (row.status !== "open") return { alreadyVoted: false, promoted: false };

    const ins = await client.query(
      "INSERT INTO board_request_votes (request_id, voter_fingerprint) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [id, fp],
    );
    if (ins.rowCount === 0) return { alreadyVoted: true, promoted: false };

    const upd = await client.query<{ vote_count: number }>(
      "UPDATE board_requests SET vote_count = vote_count + 1 WHERE id = $1 RETURNING vote_count",
      [id],
    );
    if (upd.rows[0]!.vote_count < threshold) return { alreadyVoted: false, promoted: false };

    // 자동 승격: slug 충돌 시 요청 id를 붙여 유일하게 만든다.
    let slug = slugify(row.requested_name) || `board-${id}`;
    const clash = await client.query("SELECT 1 FROM categories WHERE slug = $1", [slug]);
    if (clash.rowCount) slug = `${slug}-${id}`;
    const cat = await client.query<{ id: number }>(
      `INSERT INTO categories (name, slug, description, sort_order, auto_promoted_at)
       VALUES ($1, $2, $3, 1000, now()) RETURNING id`,
      [row.requested_name, slug, row.description],
    );
    await client.query(
      "UPDATE board_requests SET status = 'promoted', promoted_category_id = $2, promoted_at = now() WHERE id = $1",
      [id, cat.rows[0]!.id],
    );
    return { alreadyVoted: false, promoted: true };
  });
  const request = (await query<BoardRequest>(`${SELECT} WHERE r.id = $1`, [id]))[0]!;
  return { request, threshold, ...outcome };
}
