/**
 * 🧩 방 놀이 탭 2단계 저장소 (122). 규칙·설정은 src/lib/roomBoards.ts.
 * 모두 익명 (visitor = 방문자 쿠키 해시). 닉네임은 순위·배지에만 쓰고 받지 않아도 된다.
 */
import { heuristicAbuse } from "../abuse";
import { identityKey } from "../badges";
import { query, tx } from "../db";
import { HttpError, notFound } from "../errors";
import { kstDay } from "../metrics";
import { isReservedNickname } from "../validation";
import { scheduleLines } from "../adSchedule";
import {
  boardOf, ingredientOfDay, kstMonthDayParts, kstWeekDay, logPeriod, logWindow, periodStreak, photoWeek, photoWeekEnds, pickPeriod,
  prevPhotoWeek, quizAnswer, ratingBoard, ratingPeriod, ratingScoreOk, topPercent, avgOf, validMonthDay, cleanLabel,
  PET_HIDE_REPORTS, PETS_PER_PERSON, PHOTO_HIDE_REPORTS, QUIZ_RATE_MIN, RANK_MIN_PEOPLE, RATE_MIN_PEOPLE, VOTE_DAILY_POSTS, VOTE_HIDE_REPORTS, VOTE_HOURS, WINNER_BADGE,
  type LogBoard, type PetBoard, type PetKind, type PhotoBoard, type PickBoard, type RatingBoard, type RatingRow, type RoomBoard, type VoteBoard,
} from "../roomBoards";
import { logEntry, shortTextProblem } from "../roomBoardsCheck";
import { recentEventPosts } from "./adSchedule";
import { tokenOk } from "./images";

const bad = (msg: string) => new HttpError(400, "invalid_input", msg);

/** 닉네임 (선택): 2~20자, 운영자 사칭·욕설은 버린다 */
export function cleanNick(n: string | null | undefined): string | null {
  const t = (n ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 20 || isReservedNickname(t) || heuristicAbuse(t)) return null;
  return t;
}

function need<K extends RoomBoard["kind"]>(key: string, kind: K): Extract<RoomBoard, { kind: K }> {
  const b = boardOf(key);
  if (!b || b.kind !== kind) throw notFound("놀이판");
  return b as Extract<RoomBoard, { kind: K }>;
}

// ---------------------------------------------------------------------------
// 📒 방 기록판

export type LogCard = {
  kind: "log";
  window: "이번 주" | "이번 달";
  people: number;
  total: number;
  avg: number | null;
  /** 이번 기간(오늘·이번 달)에 내가 남긴 것 */
  today: { label: string; value: number }[];
  myTotal: number | null;
  streak: number;
  topPct: number | null;
  labels: { label: string; people: number; total: number }[];
  /** 닉네임을 남긴 사람만, 5명 이상일 때 */
  top: { name: string; total: number; me: boolean }[];
  /** 한 달 체크 판: 이번 달 완료 / 최근 3달 참여한 사람 (5명부터 %) */
  rate: { done: number; base: number; pct: number | null } | null;
};

export async function logCard(key: string, visitor: string | null, now = new Date()): Promise<LogCard> {
  const b = need(key, "log");
  const win = logWindow(b, now);
  const period = logPeriod(b, now);
  const v = visitor ?? "";
  const people = await query<{ visitor_hash: string; total: string; nickname: string | null }>(
    `SELECT visitor_hash, sum(value)::text AS total,
            (array_agg(nickname ORDER BY updated_at DESC) FILTER (WHERE nickname IS NOT NULL))[1] AS nickname
       FROM room_logs WHERE board = $1 AND period >= $2::date GROUP BY visitor_hash`,
    [key, win.from],
  );
  const totals = people.map((p) => Number(p.total));
  const total = Math.round(totals.reduce((a, c) => a + c, 0) * 10) / 10;
  const me = people.find((p) => p.visitor_hash === v);
  const myTotal = me ? Number(me.total) : null;
  const labels = b.input === "number" || b.input === "check" ? [] : await query<{ label: string; people: number; total: string }>(
    `SELECT label, count(DISTINCT visitor_hash)::int AS people, sum(value)::text AS total FROM room_logs
      WHERE board = $1 AND period >= $2::date AND label <> '' GROUP BY label ORDER BY people DESC, sum(value) DESC, label LIMIT 20`,
    [key, win.from],
  );
  const today = visitor ? await query<{ label: string; value: string }>("SELECT label, value::text FROM room_logs WHERE board = $1 AND visitor_hash = $2 AND period = $3::date ORDER BY created_at", [key, v, period]) : [];
  const periods = visitor
    ? (await query<{ p: string }>("SELECT DISTINCT period::text AS p FROM room_logs WHERE board = $1 AND visitor_hash = $2 AND period > $3::date - 800", [key, v, period])).map((r) => r.p)
    : [];
  let rate: LogCard["rate"] = null;
  if (b.input === "check" && b.period === "month") {
    const [r] = await query<{ done: number; base: number }>(
      `SELECT count(DISTINCT visitor_hash) FILTER (WHERE period = $2::date)::int AS done, count(DISTINCT visitor_hash)::int AS base
         FROM room_logs WHERE board = $1 AND period > ($2::date - interval '3 months')`,
      [key, period],
    );
    const base = r?.base ?? 0;
    rate = { done: r?.done ?? 0, base, pct: base >= RATE_MIN_PEOPLE ? Math.round(((r?.done ?? 0) / base) * 100) : null };
  }
  const top = b.rank && people.length >= RANK_MIN_PEOPLE
    ? people.filter((p) => p.nickname).sort((a, c) => Number(c.total) - Number(a.total)).slice(0, 5).map((p) => ({ name: p.nickname!, total: Number(p.total), me: p.visitor_hash === v }))
    : [];
  return {
    kind: "log",
    window: win.label,
    people: people.length,
    total,
    avg: b.input === "check" ? null : avgOf(total, people.length),
    today: today.map((t) => ({ label: t.label, value: Number(t.value) })),
    myTotal,
    streak: periodStreak(periods, period, b.period),
    topPct: b.rank ? topPercent(totals, myTotal) : null,
    labels: labels.map((l) => ({ label: l.label, people: l.people, total: Number(l.total) })),
    top,
    rate,
  };
}

export async function addLog(key: string, visitor: string, input: { value?: number | null; label?: string | null; nickname?: string | null }, now = new Date()): Promise<LogCard> {
  const b: LogBoard = need(key, "log");
  const e = logEntry(b, input);
  if (typeof e === "string") throw bad(e);
  const period = logPeriod(b, now);
  if (b.perPeriod) {
    const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM room_logs WHERE board = $1 AND visitor_hash = $2 AND period = $3::date AND label <> $4", [key, visitor, period, e.label]);
    if ((r?.n ?? 0) >= b.perPeriod) throw bad(`이번 달에는 ${b.perPeriod}개까지 남길 수 있어요.`);
  }
  if (b.input === "chips") {
    // 칩은 하루 합계가 너무 커지지 않게 (다른 칩 포함 10잔)
    const [r] = await query<{ s: string | null }>("SELECT sum(value)::text AS s FROM room_logs WHERE board = $1 AND visitor_hash = $2 AND period = $3::date AND label <> $4", [key, visitor, period, e.label]);
    if (Number(r?.s ?? 0) + e.value > 10) throw bad("하루에 10잔까지 남길 수 있어요.");
  }
  await query(
    `INSERT INTO room_logs (board, visitor_hash, period, label, value, nickname) VALUES ($1, $2, $3::date, $4, $5, $6)
     ON CONFLICT (board, visitor_hash, period, label) DO UPDATE SET value = EXCLUDED.value, nickname = coalesce(EXCLUDED.nickname, room_logs.nickname), updated_at = now()`,
    [key, visitor, period, e.label, e.value, cleanNick(input.nickname)],
  );
  return logCard(key, visitor, now);
}

/** 이번 기간에 남긴 한 줄 지우기 */
export async function removeLog(key: string, visitor: string, label: string, now = new Date()): Promise<LogCard> {
  const b = need(key, "log");
  await query("DELETE FROM room_logs WHERE board = $1 AND visitor_hash = $2 AND period = $3::date AND label = $4", [key, visitor, logPeriod(b, now), cleanLabel(label ?? "")]);
  return logCard(key, visitor, now);
}

// ---------------------------------------------------------------------------
// 신고 (사진·투표 글·반려견 달력 공용)

type ReportKind = "photo" | "vote" | "pet";
const REPORT_TABLE: Record<ReportKind, { table: string; hideAt: number }> = {
  photo: { table: "room_photos", hideAt: PHOTO_HIDE_REPORTS },
  vote: { table: "room_votes", hideAt: VOTE_HIDE_REPORTS },
  pet: { table: "room_pets", hideAt: PET_HIDE_REPORTS },
};

/** 한 사람 한 번. 신고가 hideAt 번 모이면 가린다. 내 것은 신고하지 않는다 */
export async function reportItem(kind: ReportKind, id: string, visitor: string): Promise<{ hidden: boolean }> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("항목");
  const t = REPORT_TABLE[kind];
  return tx(async (c) => {
    const { rows } = await c.query<{ owner: boolean; is_hidden: boolean }>(`SELECT visitor_hash = $2 AS owner, is_hidden FROM ${t.table} WHERE id = $1 FOR UPDATE`, [id, visitor]);
    const it = rows[0];
    if (!it) throw notFound("항목");
    if (it.owner) throw new HttpError(403, "own_item", "내 것은 신고할 수 없어요.");
    const ins = await c.query("INSERT INTO room_play_reports (kind, target_id, visitor_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [kind, id, visitor]);
    if (!ins.rowCount) return { hidden: it.is_hidden };
    const { rows: up } = await c.query<{ is_hidden: boolean }>(
      `UPDATE ${t.table} SET report_count = report_count + 1, is_hidden = is_hidden OR report_count + 1 >= $2 WHERE id = $1 RETURNING is_hidden`,
      [id, t.hideAt],
    );
    if (kind === "photo" && up[0]?.is_hidden) await c.query("UPDATE room_photos SET hidden_reason = coalesce(hidden_reason, 'reports') WHERE id = $1", [id]);
    return { hidden: !!up[0]?.is_hidden };
  });
}

// ---------------------------------------------------------------------------
// 📸 주간 사진 투표

export type PhotoItem = { id: string; image_id: string; nickname: string | null; hearts: number; hearted: boolean; mine: boolean; hidden: boolean };
export type PhotoCard = {
  kind: "photo";
  week: string;
  endsAt: string;
  photos: PhotoItem[];
  mine: string | null;
  lastWinner: { nickname: string | null; image_id: string; hearts: number } | null;
};

export async function photoCard(key: string, visitor: string | null, now = new Date()): Promise<PhotoCard> {
  need(key, "photo");
  const week = photoWeek(now);
  const v = visitor ?? "";
  const rows = await query<{ id: string; image_id: string; nickname: string | null; hearts: number; hearted: boolean; mine: boolean; is_hidden: boolean }>(
    `SELECT p.id::text, p.image_id::text, p.nickname, p.hearts, p.visitor_hash = $3 AS mine, p.is_hidden,
            EXISTS (SELECT 1 FROM room_photo_hearts h WHERE h.photo_id = p.id AND h.visitor_hash = $3) AS hearted
       FROM room_photos p WHERE p.board = $1 AND p.week = $2::date AND (NOT p.is_hidden OR p.visitor_hash = $3)
      ORDER BY p.hearts DESC, p.created_at ASC LIMIT 60`,
    [key, week, v],
  );
  const [w] = await query<{ nickname: string | null; image_id: string; hearts: number }>(
    `SELECT nickname, image_id::text, hearts FROM room_photos WHERE board = $1 AND week = $2::date AND NOT is_hidden AND hearts >= 1
      ORDER BY hearts DESC, created_at ASC LIMIT 1`,
    [key, prevPhotoWeek(now)],
  );
  const photos = rows.map((r) => ({ id: r.id, image_id: r.image_id, nickname: r.nickname, hearts: r.hearts, hearted: r.hearted, mine: r.mine, hidden: r.is_hidden }));
  return { kind: "photo", week, endsAt: photoWeekEnds(now).toISOString(), photos, mine: photos.find((p) => p.mine)?.id ?? null, lastWinner: w ?? null };
}

/** 이번 주 사진 한 장 (POST /api/uploads 가 준 id·token). 사진 AI 검사는 키가 있으면 올린 뒤 따로 (확신이 높을 때만 가림) */
export async function addPhoto(key: string, visitor: string, input: { image: { id: string; token: string }; nickname?: string | null }, now = new Date()): Promise<PhotoCard> {
  const b: PhotoBoard = need(key, "photo");
  if (!tokenOk(input.image.id, input.image.token)) throw new HttpError(400, "invalid_image", "사진을 다시 올려 주세요.");
  const week = photoWeek(now);
  const id = await tx(async (c) => {
    const ins = await c.query<{ id: string }>(
      `INSERT INTO room_photos (board, week, visitor_hash, nickname, image_id) VALUES ($1, $2::date, $3, $4, $5)
       ON CONFLICT (board, week, visitor_hash) DO NOTHING RETURNING id::text`,
      [b.key, week, visitor, cleanNick(input.nickname), input.image.id],
    );
    if (!ins.rows[0]) throw new HttpError(409, "already", "이번 주 사진은 이미 올렸어요. 금요일 밤 9시에 새 주가 열려요.");
    const got = await c.query(
      "UPDATE post_images SET room_photo_id = $2, attached_at = now() WHERE id = $1 AND post_id IS NULL AND neo_id IS NULL AND room_photo_id IS NULL AND comment_id IS NULL RETURNING id",
      [input.image.id, ins.rows[0].id],
    );
    if (!got.rowCount) throw new HttpError(400, "invalid_image", "사진을 다시 올려 주세요.");
    return ins.rows[0].id;
  });
  void checkPhotoLater(id, input.image.id);
  return photoCard(key, visitor, now);
}

async function checkPhotoLater(photoId: string, imageId: string): Promise<void> {
  try {
    const { aiImageAbuse } = await import("../abuse");
    const v = await aiImageAbuse(imageId);
    if (v) await query("UPDATE room_photos SET is_hidden = true, hidden_reason = 'ai_image' WHERE id = $1", [photoId]);
  } catch (err) {
    console.error("[roomBoards] 사진 검사 실패:", (err as Error).message);
  }
}

/** ❤️ 토글 (이번 주 사진만, 내 사진 빼고) */
export async function heartPhoto(key: string, id: string, visitor: string, now = new Date()): Promise<PhotoCard> {
  need(key, "photo");
  if (!/^\d{1,18}$/.test(id)) throw notFound("사진");
  await tx(async (c) => {
    const { rows } = await c.query<{ owner: boolean; current: boolean }>(
      "SELECT visitor_hash = $2 AS owner, week = $3::date AS current FROM room_photos WHERE id = $1 AND board = $4 AND NOT is_hidden FOR UPDATE",
      [id, visitor, photoWeek(now), key],
    );
    const p = rows[0];
    if (!p) throw notFound("사진");
    if (p.owner) throw new HttpError(403, "own_item", "내 사진에는 누를 수 없어요.");
    if (!p.current) throw new HttpError(409, "closed", "지난주 투표는 끝났어요.");
    const del = await c.query("DELETE FROM room_photo_hearts WHERE photo_id = $1 AND visitor_hash = $2", [id, visitor]);
    if (del.rowCount) await c.query("UPDATE room_photos SET hearts = GREATEST(0, hearts - 1) WHERE id = $1", [id]);
    else {
      await c.query("INSERT INTO room_photo_hearts (photo_id, visitor_hash) VALUES ($1, $2)", [id, visitor]);
      await c.query("UPDATE room_photos SET hearts = hearts + 1 WHERE id = $1", [id]);
    }
  });
  return photoCard(key, visitor, now);
}

export async function deletePhoto(key: string, id: string, visitor: string, now = new Date()): Promise<PhotoCard> {
  need(key, "photo");
  const rows = await query<{ image_id: string }>("DELETE FROM room_photos WHERE id = $1 AND board = $2 AND visitor_hash = $3 RETURNING image_id::text", [/^\d{1,18}$/.test(id) ? id : "0", key, visitor]);
  if (!rows[0]) throw notFound("내 사진");
  const { deleteFiles } = await import("./images");
  await deleteFiles([rows[0].image_id]);
  return photoCard(key, visitor, now);
}

/** 🏆 지난주 1등 닉네임들 (모든 사진 판). 키: identityKey → 배지 */
export async function photoWinnerBadges(nickKeys: readonly string[], now = new Date()): Promise<Record<string, string>> {
  if (!nickKeys.length) return {};
  const rows = await query<{ nickname: string | null }>(
    `SELECT DISTINCT ON (board) board, nickname FROM room_photos
      WHERE week = $1::date AND NOT is_hidden AND hearts >= 1 ORDER BY board, hearts DESC, created_at ASC`,
    [prevPhotoWeek(now)],
  );
  const want = new Set(nickKeys);
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.nickname ? identityKey(r.nickname) : "";
    if (k && want.has(k)) out[k] = WINNER_BADGE;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 🤔 살까 말까

export type VoteItem = {
  id: string; title: string; price: number | null; nickname: string | null; closes_at: string; closed: boolean;
  /** 내가 투표했거나 마감됐거나 내 글일 때만 */
  tally: { yes: number; no: number } | null;
  mine: boolean | null;
  owner: boolean;
};
export type VoteCard = { kind: "vote"; open: VoteItem[]; closed: VoteItem[] };

type VoteRow = { id: string; title: string; price: number | null; nickname: string | null; closes_at: string; closed: boolean; yes_count: number; no_count: number; owner: boolean; mine: boolean | null };
const VCOLS = `v.id::text, v.title, v.price, v.nickname, v.closes_at, v.closes_at <= now() AS closed, v.yes_count, v.no_count, v.visitor_hash = $2 AS owner,
  (SELECT choice FROM room_vote_ballots b WHERE b.vote_id = v.id AND b.visitor_hash = $2) AS mine`;
const vshape = (r: VoteRow): VoteItem => ({
  id: r.id, title: r.title, price: r.price, nickname: r.nickname, closes_at: r.closes_at, closed: r.closed,
  tally: r.closed || r.owner || r.mine !== null ? { yes: r.yes_count, no: r.no_count } : null, mine: r.mine, owner: r.owner,
});

export async function voteCard(key: string, visitor: string | null): Promise<VoteCard> {
  need(key, "vote");
  const v = visitor ?? "";
  const open = await query<VoteRow>(`SELECT ${VCOLS} FROM room_votes v WHERE v.board = $1 AND NOT v.is_hidden AND v.closes_at > now() ORDER BY v.created_at DESC LIMIT 20`, [key, v]);
  const closed = await query<VoteRow>(`SELECT ${VCOLS} FROM room_votes v WHERE v.board = $1 AND NOT v.is_hidden AND v.closes_at <= now() ORDER BY v.closes_at DESC LIMIT 10`, [key, v]);
  return { kind: "vote", open: open.map(vshape), closed: closed.map(vshape) };
}

export async function createVote(key: string, visitor: string, input: { title: string; price?: number | null; nickname?: string | null; fingerprint?: string }, now = new Date()): Promise<VoteCard> {
  const b: VoteBoard = need(key, "vote");
  const title = cleanLabel(input.title ?? "");
  if (title.length < 2) throw bad("이름을 2자 이상 적어 주세요.");
  const p = shortTextProblem(title, b.room, 40);
  if (p) throw bad(p);
  const price = input.price == null ? null : Math.floor(Number(input.price));
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100_000_000)) throw bad("가격은 0~1억 원 사이로 적어 주세요.");
  const [{ n }] = (await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM room_votes WHERE board = $1 AND (visitor_hash = $2 OR fingerprint = $3) AND created_at > $4::timestamptz - interval '24 hours'",
    [key, visitor, input.fingerprint ?? "", now.toISOString()],
  )) as [{ n: number }];
  if (n >= VOTE_DAILY_POSTS) throw new HttpError(429, "rate_limited", `하루에 ${VOTE_DAILY_POSTS}개까지 올릴 수 있어요.`);
  await query(
    "INSERT INTO room_votes (board, visitor_hash, fingerprint, nickname, title, price, closes_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz + make_interval(hours => $8), $7::timestamptz)",
    [key, visitor, input.fingerprint ?? null, cleanNick(input.nickname), title, price, now.toISOString(), VOTE_HOURS],
  );
  return voteCard(key, visitor);
}

/** 투표 (마감 전, 바꾸기 가능). 내 글에는 투표하지 않는다 */
export async function castVote(key: string, id: string, visitor: string, choice: boolean): Promise<VoteCard> {
  need(key, "vote");
  if (!/^\d{1,18}$/.test(id)) throw notFound("투표");
  await tx(async (c) => {
    const { rows } = await c.query<{ open: boolean; owner: boolean }>(
      "SELECT closes_at > now() AS open, visitor_hash = $2 AS owner FROM room_votes WHERE id = $1 AND board = $3 AND NOT is_hidden FOR UPDATE",
      [id, visitor, key],
    );
    const it = rows[0];
    if (!it) throw notFound("투표");
    if (!it.open) throw new HttpError(409, "closed", "투표가 끝났어요.");
    if (it.owner) throw new HttpError(403, "own_item", "내 글에는 투표할 수 없어요.");
    const prev = await c.query<{ choice: boolean }>("SELECT choice FROM room_vote_ballots WHERE vote_id = $1 AND visitor_hash = $2", [id, visitor]);
    const before = prev.rows[0]?.choice;
    if (before === choice) return;
    await c.query(
      "INSERT INTO room_vote_ballots (vote_id, visitor_hash, choice) VALUES ($1, $2, $3) ON CONFLICT (vote_id, visitor_hash) DO UPDATE SET choice = EXCLUDED.choice, created_at = now()",
      [id, visitor, choice],
    );
    const col = (x: boolean) => (x ? "yes_count" : "no_count");
    await c.query(`UPDATE room_votes SET ${col(choice)} = ${col(choice)} + 1${before === undefined ? "" : `, ${col(before)} = GREATEST(0, ${col(before)} - 1)`} WHERE id = $1`, [id]);
  });
  return voteCard(key, visitor);
}

export async function deleteVote(key: string, id: string, visitor: string): Promise<VoteCard> {
  need(key, "vote");
  const rows = await query("DELETE FROM room_votes WHERE id = $1 AND board = $2 AND visitor_hash = $3 RETURNING id", [/^\d{1,18}$/.test(id) ? id : "0", key, visitor]);
  if (!rows.length) throw notFound("내 투표 글");
  return voteCard(key, visitor);
}

// ---------------------------------------------------------------------------
// 🌱 매일 퀴즈 · 🍷 주간 투표

export type PickCard =
  | {
      kind: "pick"; mode: "quiz"; day: string; question: string;
      /** 답한 뒤에만 */
      result: { choice: string; correct: boolean; answer: string; why: string } | null;
      n: number; correctPct: number | null; streak: number; wins: number;
    }
  | { kind: "pick"; mode: "vote"; period: string; counts: Record<string, number>; total: number; mine: string | null };

export async function pickCard(key: string, visitor: string | null, now = new Date()): Promise<PickCard> {
  const b: PickBoard = need(key, "pick");
  const period = pickPeriod(b, now);
  const v = visitor ?? "";
  if (b.mode === "vote") {
    const rows = await query<{ choice: string; c: number }>("SELECT choice, count(*)::int AS c FROM room_picks WHERE board = $1 AND period = $2::date GROUP BY choice", [key, period]);
    const counts: Record<string, number> = Object.fromEntries(b.options.map((o) => [o, 0]));
    for (const r of rows) if (r.choice in counts) counts[r.choice] = r.c;
    const [m] = visitor ? await query<{ choice: string }>("SELECT choice FROM room_picks WHERE board = $1 AND period = $2::date AND visitor_hash = $3", [key, period, v]) : [];
    return { kind: "pick", mode: "vote", period, counts, total: Object.values(counts).reduce((a, c) => a + c, 0), mine: m?.choice ?? null };
  }
  const ing = ingredientOfDay(period);
  const [agg] = await query<{ n: number; ok: number }>("SELECT count(*)::int AS n, count(*) FILTER (WHERE correct)::int AS ok FROM room_picks WHERE board = $1 AND period = $2::date", [key, period]);
  const mine = visitor ? await query<{ period: string; choice: string; correct: boolean }>("SELECT period::text, choice, correct FROM room_picks WHERE board = $1 AND visitor_hash = $2 AND period > $3::date - 800", [key, v, period]) : [];
  const today = mine.find((m) => m.period === period);
  const n = agg?.n ?? 0;
  return {
    kind: "pick", mode: "quiz", day: period, question: ing.name,
    result: today ? { choice: today.choice, correct: today.correct, answer: quizAnswer(period), why: ing.why } : null,
    n, correctPct: today && n >= QUIZ_RATE_MIN ? Math.round(((agg?.ok ?? 0) / n) * 100) : null,
    streak: periodStreak(mine.map((m) => m.period), period, "day"),
    wins: mine.filter((m) => m.correct).length,
  };
}

/** 퀴즈는 하루 한 번 (바꿀 수 없음), 주간 투표는 바꾸기 가능 */
export async function pick(key: string, visitor: string, choice: string, now = new Date()): Promise<PickCard> {
  const b: PickBoard = need(key, "pick");
  if (!b.options.includes(choice)) throw bad("보기에서 골라 주세요.");
  const period = pickPeriod(b, now);
  if (b.mode === "quiz") {
    await query("INSERT INTO room_picks (board, period, visitor_hash, choice, correct) VALUES ($1, $2::date, $3, $4, $5) ON CONFLICT DO NOTHING", [key, period, visitor, choice, choice === quizAnswer(period)]);
  } else {
    await query(
      "INSERT INTO room_picks (board, period, visitor_hash, choice) VALUES ($1, $2::date, $3, $4) ON CONFLICT (board, period, visitor_hash) DO UPDATE SET choice = EXCLUDED.choice, created_at = now()",
      [key, period, visitor, choice],
    );
  }
  return pickCard(key, visitor, now);
}

// ---------------------------------------------------------------------------
// ⭐ 별점판 · 🔐 성공/실패 기록판

export type RatingCard = { kind: "rating"; shown: (RatingRow & { avg: number })[]; waiting: RatingRow[]; people: number };
export const RATINGS_PER_PERSON = 30;

export async function ratingCard(key: string, visitor: string | null, now = new Date()): Promise<RatingCard> {
  const b: RatingBoard = need(key, "rating");
  const period = ratingPeriod(b, now);
  const rows = await query<{ label: string; n: number; sum: number; mine: number | null }>(
    `SELECT label, count(*)::int AS n, sum(score)::int AS sum, max(score) FILTER (WHERE visitor_hash = $3)::int AS mine
       FROM room_ratings WHERE board = $1 AND period = $2::date GROUP BY label ORDER BY count(*) DESC LIMIT 200`,
    [key, period, visitor ?? ""],
  );
  const [p] = await query<{ n: number }>("SELECT count(DISTINCT visitor_hash)::int AS n FROM room_ratings WHERE board = $1 AND period = $2::date", [key, period]);
  const { shown, waiting } = ratingBoard(rows);
  return { kind: "rating", shown: shown.slice(0, 30), waiting: waiting.slice(0, 30), people: p?.n ?? 0 };
}

export async function rate(key: string, visitor: string, input: { label: string; score: number; nickname?: string | null }, now = new Date()): Promise<RatingCard> {
  const b: RatingBoard = need(key, "rating");
  const label = cleanLabel(input.label ?? "");
  const p = shortTextProblem(label, b.room, 30);
  if (p) throw bad(p);
  if (!ratingScoreOk(b, input.score)) throw bad(b.scale === "stars" ? "별점은 1~5개예요." : "성공 또는 실패를 골라 주세요.");
  const period = ratingPeriod(b, now);
  const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM room_ratings WHERE board = $1 AND period = $2::date AND visitor_hash = $3 AND label <> $4", [key, period, visitor, label]);
  if ((r?.n ?? 0) >= RATINGS_PER_PERSON) throw bad(`${RATINGS_PER_PERSON}개까지 남길 수 있어요.`);
  await query(
    `INSERT INTO room_ratings (board, period, visitor_hash, label, score, nickname) VALUES ($1, $2::date, $3, $4, $5, $6)
     ON CONFLICT (board, period, visitor_hash, label) DO UPDATE SET score = EXCLUDED.score, updated_at = now()`,
    [key, period, visitor, label, input.score, cleanNick(input.nickname)],
  );
  return ratingCard(key, visitor, now);
}

export async function unrate(key: string, visitor: string, label: string, now = new Date()): Promise<RatingCard> {
  const b: RatingBoard = need(key, "rating");
  await query("DELETE FROM room_ratings WHERE board = $1 AND period = $2::date AND visitor_hash = $3 AND label = $4", [key, ratingPeriod(b, now), visitor, cleanLabel(label ?? "")]);
  return ratingCard(key, visitor, now);
}

// ---------------------------------------------------------------------------
// 🐶 생일·입양일 달력

export type Pet = { id: string; pet_name: string; nickname: string | null; kind: PetKind; month: number; day: number; cheers: number; cheered: boolean; mine: boolean };
export type PetCard = { kind: "pet"; today: Pet[]; month: Pet[]; mine: Pet[]; total: number };

export async function petCard(key: string, visitor: string | null, now = new Date()): Promise<PetCard> {
  need(key, "pet");
  const { month, day } = kstMonthDayParts(now);
  const v = visitor ?? "";
  const rows = await query<Pet & { id: string }>(
    `SELECT p.id::text, p.pet_name, p.nickname, p.kind, p.month, p.day, p.visitor_hash = $3 AS mine,
            (SELECT count(*)::int FROM room_pet_cheers c WHERE c.pet_id = p.id AND c.day = $4::date) AS cheers,
            EXISTS (SELECT 1 FROM room_pet_cheers c WHERE c.pet_id = p.id AND c.day = $4::date AND c.visitor_hash = $3) AS cheered
       FROM room_pets p WHERE p.board = $1 AND NOT p.is_hidden AND (p.month = $2 OR p.visitor_hash = $3)
      ORDER BY p.day, p.id LIMIT 300`,
    [key, month, v, kstDay(now)],
  );
  const [t] = await query<{ n: number }>("SELECT count(*)::int AS n FROM room_pets WHERE board = $1 AND NOT is_hidden", [key]);
  return {
    kind: "pet",
    today: rows.filter((r) => r.month === month && r.day === day),
    month: rows.filter((r) => r.month === month && r.day > day),
    mine: rows.filter((r) => r.mine),
    total: t?.n ?? 0,
  };
}

export async function addPet(key: string, visitor: string, input: { name: string; kind: string; month: number; day: number; nickname?: string | null }, now = new Date()): Promise<PetCard> {
  const b: PetBoard = need(key, "pet");
  const name = cleanLabel(input.name ?? "");
  const p = shortTextProblem(name, b.room, 10);
  if (p) throw bad(p.replace("10자까지", "이름은 10자까지"));
  if (input.kind !== "birthday" && input.kind !== "adopted") throw bad("생일 또는 입양일을 골라 주세요.");
  if (!validMonthDay(input.month, input.day)) throw bad("날짜를 확인해 주세요.");
  const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM room_pets WHERE board = $1 AND visitor_hash = $2", [key, visitor]);
  if ((r?.n ?? 0) >= PETS_PER_PERSON) throw bad(`한 사람에 ${PETS_PER_PERSON}마리까지 남길 수 있어요.`);
  await query("INSERT INTO room_pets (board, visitor_hash, nickname, pet_name, kind, month, day) VALUES ($1, $2, $3, $4, $5, $6, $7)", [key, visitor, cleanNick(input.nickname), name, input.kind, input.month, input.day]);
  return petCard(key, visitor, now);
}

export async function deletePet(key: string, id: string, visitor: string, now = new Date()): Promise<PetCard> {
  need(key, "pet");
  const rows = await query("DELETE FROM room_pets WHERE id = $1 AND board = $2 AND visitor_hash = $3 RETURNING id", [/^\d{1,18}$/.test(id) ? id : "0", key, visitor]);
  if (!rows.length) throw notFound("내 아이 기록");
  return petCard(key, visitor, now);
}

/** 🎉 오늘 생일·입양일인 아이에게만, 하루 한 번 */
export async function cheerPet(key: string, id: string, visitor: string, now = new Date()): Promise<PetCard> {
  need(key, "pet");
  const { month, day } = kstMonthDayParts(now);
  const [p] = await query<{ ok: boolean }>("SELECT true AS ok FROM room_pets WHERE id = $1 AND board = $2 AND NOT is_hidden AND month = $3 AND day = $4", [/^\d{1,18}$/.test(id) ? id : "0", key, month, day]);
  if (!p) throw new HttpError(409, "not_today", "오늘이 그날인 아이에게만 축하할 수 있어요.");
  await query("INSERT INTO room_pet_cheers (pet_id, visitor_hash, day) VALUES ($1, $2, $3::date) ON CONFLICT DO NOTHING", [id, visitor, kstDay(now)]);
  return petCard(key, visitor, now);
}

// ---------------------------------------------------------------------------
// 공용

export type BoardCard = LogCard | PhotoCard | VoteCard | PickCard | RatingCard | PetCard;

export async function boardCard(key: string, visitor: string | null, now = new Date()): Promise<BoardCard> {
  const b = boardOf(key);
  if (!b) throw notFound("놀이판");
  switch (b.kind) {
    case "log": return logCard(key, visitor, now);
    case "photo": return photoCard(key, visitor, now);
    case "vote": return voteCard(key, visitor);
    case "pick": return pickCard(key, visitor, now);
    case "rating": return ratingCard(key, visitor, now);
    case "pet": return petCard(key, visitor, now);
  }
}

// ---------------------------------------------------------------------------
// 🙋 이번 주 행사 (방의 [행사] 글, 갈 거예요는 기존 /api/posts/:id/going)

export type WeekEvent = { postId: string; name: string; when: string; dday: number };
export async function weekEvents(room: string, now = new Date()): Promise<WeekEvent[]> {
  const [c] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [room]);
  if (!c) return [];
  const posts = (await recentEventPosts(c.id, 40)).filter((p) => p.title.startsWith("[행사]"));
  return scheduleLines(posts, now, 10).filter((l) => l.dday <= 7);
}

// ---------------------------------------------------------------------------
// 🎾 랠리 탭 이번 주 순위 (월요일 0시 KST 초기화)

export type WeekRankRow = { name: string; score: number; me: boolean };
export async function rallyWeekRank(visitor: string | null, now = new Date()): Promise<WeekRankRow[]> {
  const rows = await query<{ visitor_hash: string; best: number; nickname: string | null }>(
    `SELECT visitor_hash, max(score)::int AS best,
            (array_agg(nickname ORDER BY created_at DESC) FILTER (WHERE nickname IS NOT NULL))[1] AS nickname
       FROM game_plays WHERE game = 'rally' AND day >= $1::date GROUP BY visitor_hash
      ORDER BY best DESC, min(created_at) ASC LIMIT 10`,
    [kstWeekDay(now)],
  );
  return rows.map((r) => ({ name: r.nickname ?? `손님 ${r.visitor_hash.slice(0, 4)}`, score: r.best, me: visitor !== null && r.visitor_hash === visitor }));
}

