/**
 * 🎾 테니스방 게임 모집 (10/29). 규칙은 src/lib/tennisGames.ts.
 * 연락처(contact)는 목록·상세 기본 응답에 넣지 않고 gameContact 로만 꺼낸다 (대강 게시판 gigs 와 같은 방식).
 */
import { query } from "../db";
import { HttpError, notFound, tooMany } from "../errors";
import { hashPin } from "../password";
import { hit } from "../rate-limit";
import { aiAbuse, heuristicAbuse } from "../abuse";
import { trollCheck } from "../troll";
import { assertPin } from "./pin-guard";
import { tennisTalkCounts } from "./tennisTalk";
import { ownerAlertAfter, reportAlertAfter } from "./ownerAlert";
import { kstYmd } from "../instructorRoom";
import { GAMES_TAB, TENNIS_ROOM, gameInputSchema, gameProblem, whenRange, type GameInput, type GameInputRaw, type GameType, type When } from "../tennisGames";

export type GameCard = {
  id: string;
  sido: string;
  sigungu: string;
  court: string;
  date: string;
  start: string;
  end: string;
  type: GameType;
  needM: number;
  needF: number;
  needAny: number;
  level: string;
  cost: string;
  notes: string;
  nickname: string;
  createdAt: string;
  closed: boolean;
  /** 연락처(오픈채팅·카톡 아이디)를 남겼는지. 없으면 💬 댓글로만 참여 */
  hasContact: boolean;
  /** 💬 댓글 수 (목록에서만 채운다) */
  comments?: number;
};

type Row = {
  id: string;
  sido: string;
  sigungu: string;
  court: string;
  play_date: string;
  start_time: string;
  end_time: string;
  game_type: GameType;
  need_m: number;
  need_f: number;
  need_any: number;
  level: string;
  cost: string;
  notes: string;
  nickname: string;
  created_at: string;
  closed_at: string | null;
  has_contact: boolean;
};

const COLS = `id::text, sido, sigungu, court, play_date::text AS play_date, start_time, end_time, game_type, need_m, need_f, need_any,
  level, cost, notes, nickname, created_at, closed_at, (contact <> '') AS has_contact`;

const card = (r: Row): GameCard => ({
  id: r.id,
  sido: r.sido,
  sigungu: r.sigungu,
  court: r.court,
  date: r.play_date,
  start: r.start_time,
  end: r.end_time,
  type: r.game_type,
  needM: r.need_m,
  needF: r.need_f,
  needAny: r.need_any,
  level: r.level,
  cost: r.cost,
  notes: r.notes,
  nickname: r.nickname,
  createdAt: r.created_at,
  closed: !!r.closed_at,
  hasContact: r.has_contact,
});

function check(raw: GameInputRaw, now: Date): GameInput {
  const parsed = gameInputSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "invalid_game", parsed.error.issues[0]?.message ?? "입력값을 다시 확인해 주세요");
  const g = parsed.data;
  const problem = gameProblem(g, kstYmd(now));
  if (problem) throw new HttpError(400, "invalid_game", problem);
  const v = heuristicAbuse([g.court, g.level, g.cost, g.notes].join("\n"));
  if (v && v.category !== "personal_info") throw new HttpError(400, "abuse", "올릴 수 없는 표현이 있어요");
  return g;
}

export async function createGame(raw: GameInputRaw, who: { fingerprint: string; net: string | null }, now = new Date()): Promise<{ id: string }> {
  const g = check(raw, now);
  // 같은 브라우저가 같은 날·시간·코트로 다시 올리면 먼저 올린 글로
  const [same] = await query<{ id: string }>(
    `SELECT id::text FROM tennis_games WHERE author_fingerprint = $1 AND play_date = $2::date AND start_time = $3 AND court = $4 AND closed_at IS NULL LIMIT 1`,
    [who.fingerprint, g.date, g.start, g.court],
  );
  if (same) throw Object.assign(new HttpError(409, "duplicate_game", "같은 게임을 이미 올렸어요"), { gameId: same.id });
  const [row] = await query<{ id: string }>(
    `INSERT INTO tennis_games (sido, sigungu, court, play_date, start_time, end_time, game_type, need_m, need_f, need_any, level, cost, notes, contact,
                               nickname, pw_hash, author_fingerprint, author_net, created_at, updated_at)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19) RETURNING id::text`,
    [g.sido, g.sigungu, g.court, g.date, g.start, g.end, g.type, g.needM, g.needF, g.needAny, g.level, g.cost, g.notes, g.contact.trim(), g.nickname, await hashPin(g.pw), who.fingerprint, who.net, now.toISOString()],
  );
  // 🧹 조롱·도배는 올라가되 바로 가린다: 쓴 사람에게만 보인다 (10/29)
  if (trollCheck([g.court, g.level, g.notes])) await query("UPDATE tennis_games SET ai_hidden_reason = 'troll', ai_hidden_at = now() WHERE id = $1", [row!.id]);
  ownerAlertAfter({ kind: "gig", nickname: g.nickname, fingerprint: who.fingerprint }, { kind: "gig", gigId: row!.id, text: [g.sigungu || g.sido, g.court, g.type].join(" · "), room: "🎾 게임 모집", url: `/c/${encodeURIComponent(TENNIS_ROOM)}?tab=${GAMES_TAB}` });
  return { id: row!.id };
}

/** 올린 직후 AI 운영 (키가 있을 때만): 욕설·혐오면 목록에서 가린다 */
export async function moderateGame(id: string): Promise<void> {
  const [r] = await query<{ court: string; notes: string; level: string }>("SELECT court, notes, level FROM tennis_games WHERE id = $1", [id]);
  if (!r) return;
  const abuse = await aiAbuse([r.court, r.level, r.notes].join("\n"));
  if (abuse && abuse.category !== "personal_info")
    await query("UPDATE tennis_games SET ai_hidden_reason = $2, ai_hidden_at = now() WHERE id = $1 AND ai_hidden_reason IS NULL", [id, abuse.category]);
}

export type GameFilter = { sido?: string; sigungu?: string; type?: GameType; when?: When; page?: number; /** 보는 사람 지문: 🧹 쓴 사람에게만 보이는 가린 게임 */ viewer?: string };
export const GAME_PAGE = 30;

/** 공개 목록: 가림·지난 날짜 빼고 가까운 게임 먼저. 마감한 게임은 그날까지 맨 뒤에 남겨 "마감" 으로 보인다 */
export async function listGames(f: GameFilter, now = new Date()): Promise<{ items: GameCard[]; total: number; page: number }> {
  const today = kstYmd(now);
  const params: unknown[] = [today];
  const p = (v: unknown) => (params.push(v), `$${params.length}`);
  const where = [f.viewer ? `(ai_hidden_reason IS NULL OR (ai_hidden_reason = 'troll' AND author_fingerprint = ${p(f.viewer)}))` : "ai_hidden_reason IS NULL", "play_date >= $1::date"];
  if (f.sido) where.push(`sido = ${p(f.sido)}`);
  if (f.sido && f.sigungu) where.push(`sigungu = ${p(f.sigungu)}`);
  if (f.type) where.push(`game_type = ${p(f.type)}`);
  if (f.when) {
    const [from, to] = whenRange(f.when, today);
    where.push(`play_date BETWEEN ${p(from)}::date AND ${p(to)}::date`);
  }
  const page = Math.max(1, Math.min(50, f.page ?? 1));
  const w = where.join(" AND ");
  const [rows, [count]] = await Promise.all([
    query<Row>(`SELECT ${COLS} FROM tennis_games WHERE ${w} ORDER BY (closed_at IS NOT NULL), play_date, start_time, id LIMIT ${GAME_PAGE} OFFSET ${(page - 1) * GAME_PAGE}`, params),
    query<{ n: number }>(`SELECT count(*)::int AS n FROM tennis_games WHERE ${w}`, params),
  ]);
  const counts = await tennisTalkCounts(rows.map((r) => r.id));
  return { items: rows.map((r) => ({ ...card(r), comments: counts[r.id] ?? 0 })), total: count?.n ?? 0, page };
}

async function ownerRow(id: string, fp: string, pin: string): Promise<{ play_date: string; closed_at: string | null }> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("게임");
  const [r] = await query<{ pw_hash: string; play_date: string; closed_at: string | null }>("SELECT pw_hash, play_date::text AS play_date, closed_at FROM tennis_games WHERE id = $1", [id]);
  if (!r) throw notFound("게임");
  await assertPin(`game:${id}`, fp, pin, r.pw_hash);
  return r;
}

/** 연락처: 마감·가림·지난 게임은 주지 않는다 */
export async function gameContact(id: string, now = new Date()): Promise<string> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("게임");
  const [r] = await query<{ contact: string; play_date: string; closed_at: string | null; ai_hidden_reason: string | null }>(
    "SELECT contact, play_date::text AS play_date, closed_at, ai_hidden_reason FROM tennis_games WHERE id = $1",
    [id],
  );
  if (!r || r.ai_hidden_reason) throw notFound("게임");
  if (r.closed_at || r.play_date < kstYmd(now)) throw new HttpError(410, "game_closed", "마감된 게임이에요");
  return r.contact;
}

export async function closeGame(id: string, fp: string, pin: string): Promise<void> {
  await ownerRow(id, fp, pin);
  await query("UPDATE tennis_games SET closed_at = COALESCE(closed_at, now()), updated_at = now() WHERE id = $1", [id]);
}

export async function deleteGame(id: string, fp: string, pin: string): Promise<void> {
  await ownerRow(id, fp, pin);
  await query("DELETE FROM tennis_games WHERE id = $1", [id]);
}

/** 글쓴이 수정 (닉네임은 그대로). 마감한 게임은 고치지 않는다 */
export async function updateGame(id: string, fp: string, raw: GameInputRaw, now = new Date()): Promise<void> {
  const r = await ownerRow(id, fp, String(raw.pw ?? ""));
  if (r.closed_at) throw new HttpError(409, "game_closed", "마감한 게임은 고칠 수 없어요");
  const g = check(raw, now);
  await query(
    `UPDATE tennis_games SET sido = $2, sigungu = $3, court = $4, play_date = $5::date, start_time = $6, end_time = $7, game_type = $8,
            need_m = $9, need_f = $10, need_any = $11, level = $12, cost = $13, notes = $14, contact = $15, updated_at = now() WHERE id = $1`,
    [id, g.sido, g.sigungu, g.court, g.date, g.start, g.end, g.type, g.needM, g.needF, g.needAny, g.level, g.cost, g.notes, g.contact.trim()],
  );
}

/** 글쓴이 수정 화면용 (연락처 포함, 비밀번호 확인 뒤) */
export async function gameForOwner(id: string, fp: string, pin: string): Promise<GameCard & { contact: string }> {
  await ownerRow(id, fp, pin);
  const [r] = await query<Row & { contact: string }>(`SELECT ${COLS}, contact FROM tennis_games WHERE id = $1`, [id]);
  return { ...card(r!), contact: r!.contact };
}


export async function reportGame(id: string, fp: string, reason: string): Promise<{ is_blinded: boolean; alreadyReported: boolean }> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("게임");
  const [g] = await query<{ id: string }>("SELECT id::text FROM tennis_games WHERE id = $1", [id]);
  if (!g) throw notFound("게임");
  if (!(await hit(`report:${fp}`, 20, 3600_000))) throw tooMany();
  const ins = await query<{ game_id: string }>(
    "INSERT INTO tennis_game_reports (game_id, reporter_fingerprint, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING game_id::text",
    [id, fp, reason.slice(0, 200)],
  );
  // 신고로는 가리지 않고 운영자에게 보고 (10/29 대표님)
  if (ins.length) reportAlertAfter("game", id, reason);
  const [r] = await query<{ hidden: boolean }>("SELECT ai_hidden_reason IS NOT NULL AS hidden FROM tennis_games WHERE id = $1", [id]);
  return { is_blinded: !!r?.hidden, alreadyReported: ins.length === 0 };
}
