import type { PoolClient } from "pg";
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

export type BoardVoteResult = {
  request: BoardRequest;
  alreadyVoted: boolean;
  promoted: boolean;
  threshold: number;
  /** 표는 충분하지만 최소 대기 시간 전이라 승격이 보류된 경우, 승격 가능 시각 */
  promotableAt: string | null;
};

export type PromotionOutcome = "promoted" | "duplicate" | "not_enough_votes" | "too_early" | "closed";

/**
 * 승격 조건을 확인하고 충족하면 categories 로 승격한다. 요청 행이 FOR UPDATE 로 잠긴 트랜잭션 안에서 호출할 것.
 * - vote_count >= threshold
 * - 요청 후 minAgeHours 경과 (갓 올라온 요청에 표를 몰아 즉시 보드를 여는 것 방지)
 * - 같은 이름의 보드가 이미 있으면 'duplicate' 로 닫는다 (그 사이 다른 요청이 먼저 승격된 경우)
 */
export async function promoteIfEligible(
  client: PoolClient,
  id: string,
  opts: { threshold: number; minAgeHours: number; now?: Date },
): Promise<PromotionOutcome> {
  const now = opts.now ?? new Date();
  const req = await client.query<{ requested_name: string; description: string; status: string; vote_count: number; created_at: string }>(
    "SELECT requested_name, description, status, vote_count, created_at FROM board_requests WHERE id = $1 FOR UPDATE",
    [id],
  );
  const row = req.rows[0];
  if (!row || row.status !== "open") return "closed";
  if (row.vote_count < opts.threshold) return "not_enough_votes";
  if (now.getTime() - new Date(row.created_at).getTime() < opts.minAgeHours * 3600_000) return "too_early";

  const existing = await client.query<{ id: number }>("SELECT id FROM categories WHERE lower(name) = lower($1)", [row.requested_name]);
  if (existing.rows[0]) {
    await client.query("UPDATE board_requests SET status = 'duplicate', promoted_category_id = $2 WHERE id = $1", [id, existing.rows[0].id]);
    return "duplicate";
  }
  // slug 충돌 시 요청 id를 붙여 유일하게 만든다.
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
  return "promoted";
}

/**
 * 보드 개설 요청 투표. 조건을 모두 채우면 사람 승인 없이 categories 로 자동 승격한다.
 * 표가 먼저 차고 최소 대기 시간이 남았으면 보류되고, 유지보수 배치(jobs/maintenance)가 시간이 되면 승격한다.
 */
export async function voteBoardRequest(
  id: string,
  fp: string,
  threshold = config.boardPromotionThreshold,
  minAgeHours = config.boardPromotionMinAgeHours,
): Promise<BoardVoteResult> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("보드 요청");
  const outcome = await tx(async (client) => {
    const req = await client.query<{ status: string }>("SELECT status FROM board_requests WHERE id = $1 FOR UPDATE", [id]);
    if (!req.rows[0]) throw notFound("보드 요청");
    if (req.rows[0].status !== "open") return { alreadyVoted: false, promoted: false, tooEarly: false };

    const ins = await client.query(
      "INSERT INTO board_request_votes (request_id, voter_fingerprint) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [id, fp],
    );
    if (ins.rowCount === 0) return { alreadyVoted: true, promoted: false, tooEarly: false };
    await client.query("UPDATE board_requests SET vote_count = vote_count + 1 WHERE id = $1", [id]);
    const result = await promoteIfEligible(client, id, { threshold, minAgeHours });
    return { alreadyVoted: false, promoted: result === "promoted", tooEarly: result === "too_early" };
  });
  const request = (await query<BoardRequest>(`${SELECT} WHERE r.id = $1`, [id]))[0]!;
  const promotableAt = outcome.tooEarly
    ? new Date(new Date(request.created_at).getTime() + minAgeHours * 3600_000).toISOString()
    : null;
  return { request, threshold, alreadyVoted: outcome.alreadyVoted, promoted: outcome.promoted, promotableAt };
}

/** 표는 찼지만 최소 대기 시간 때문에 보류된 요청들을 승격한다 (유지보수 배치에서 호출) */
export async function promotePendingBoardRequests(
  threshold = config.boardPromotionThreshold,
  minAgeHours = config.boardPromotionMinAgeHours,
  now = new Date(),
): Promise<{ id: string; outcome: PromotionOutcome }[]> {
  const pending = await query<{ id: string }>(
    "SELECT id FROM board_requests WHERE status = 'open' AND vote_count >= $1 ORDER BY id",
    [threshold],
  );
  const results: { id: string; outcome: PromotionOutcome }[] = [];
  for (const { id } of pending) {
    const outcome = await tx((client) => promoteIfEligible(client, id, { threshold, minAgeHours, now }));
    results.push({ id, outcome });
  }
  return results;
}
