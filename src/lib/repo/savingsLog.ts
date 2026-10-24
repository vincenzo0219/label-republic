/**
 * 💰 이번 달 적립 완료 저장 (10/24). 한 달 한 줄(savings_logs) + 방 수다방 댓글 한 개 — 작가지망생방 writingLog 와 같은 틀.
 * 같은 달 다시 보내면 그 줄과 댓글을 고친다. 댓글이 지워지거나 AI 운영이 가린 기록은 세지 않는다.
 */
import { heuristicAbuse, hideParams, maskPersonalInfo } from "../abuse";
import { identityKey } from "../badges";
import { query } from "../db";
import { HttpError, notFound } from "../errors";
import { investProblem } from "../investRooms";
import { kstMonth, monthStreakAt, savingsLine, SAVINGS_NOTE_MAX, SAVINGS_ROOMS, type Bucket } from "../savingsLog";
import { createComment } from "./comments";
import { ensureRoomChat } from "./roomChat";

export type SavingsEntry = { nickname: string; author_key: string; month: string; bucket: Bucket | null; note: string | null; streak: number; comment_id: string | null };

async function monthsOf(room: string, key: string, until: string): Promise<string[]> {
  const rows = await query<{ month: string }>(
    `SELECT month::text FROM savings_logs WHERE room_slug = $1 AND author_key = $2 AND month <= $3::date AND month > $3::date - interval '10 years'`,
    [room, key, until],
  );
  return rows.map((r) => r.month);
}

/** 이번 달 적립 완료 (닉네임·비밀번호 확인은 부르는 쪽에서). 이미 있으면 고친다 */
export async function submitSavings(
  input: { room: string; nickname: string; pin: string; bucket?: Bucket | null; note?: string; fingerprint?: string; net?: string },
  now = new Date(),
): Promise<{ entry: SavingsEntry; updated: boolean }> {
  if (!SAVINGS_ROOMS.has(input.room)) throw notFound("방");
  const raw = (input.note ?? "").trim().slice(0, SAVINGS_NOTE_MAX);
  const problem = investProblem(input.room, raw);
  if (problem) throw new HttpError(400, "invest_rule", problem);
  const chat = await ensureRoomChat(input.room);
  if (!chat) throw notFound("방");
  const key = identityKey(input.nickname);
  const month = kstMonth(now);
  const note = maskPersonalInfo(raw).text.slice(0, SAVINGS_NOTE_MAX) || null;
  const bucket = input.bucket ?? null;

  const inserted = await query(
    `INSERT INTO savings_logs (room_slug, author_key, month, nickname, bucket, note) VALUES ($1, $2, $3::date, $4, $5, $6)
     ON CONFLICT (room_slug, author_key, month) DO NOTHING RETURNING 1`,
    [input.room, key, month, input.nickname, bucket, note],
  );
  const updated = inserted.length === 0;
  let commentId: string | null = null;
  if (updated) {
    const [row] = await query<{ comment_id: string | null }>(
      `UPDATE savings_logs SET bucket = $4, note = $5, nickname = $6, updated_at = now()
        WHERE room_slug = $1 AND author_key = $2 AND month = $3::date RETURNING comment_id::text`,
      [input.room, key, month, bucket, note, input.nickname],
    );
    commentId = row?.comment_id ?? null;
  }
  const streak = monthStreakAt(await monthsOf(input.room, key, month), month);
  const line = savingsLine(streak, note);

  if (commentId) {
    const abuse = heuristicAbuse(line);
    await query("UPDATE comments SET body = $2 WHERE id = $1", [commentId, line]);
    if (abuse)
      await query(
        `UPDATE comments SET ai_hidden_reason = $2, ai_hidden_note = $3, ai_hidden_model = $4, ai_hidden_at = now()
          WHERE id = $1 AND ai_hidden_at IS NULL AND NOT ai_hide_released`,
        [commentId, ...hideParams(abuse)],
      );
  } else {
    try {
      const c = await createComment(chat.postId, { nickname: input.nickname, pin: input.pin, body: line, fingerprint: input.fingerprint, net: input.net });
      commentId = String(c.id);
    } catch (err) {
      if (!updated) await query("DELETE FROM savings_logs WHERE room_slug = $1 AND author_key = $2 AND month = $3::date", [input.room, key, month]);
      throw err;
    }
    await query("UPDATE savings_logs SET comment_id = $4 WHERE room_slug = $1 AND author_key = $2 AND month = $3::date", [input.room, key, month, commentId]);
  }
  return { entry: { nickname: input.nickname, author_key: key, month, bucket, note, streak, comment_id: commentId }, updated };
}

const VISIBLE = "JOIN comments c ON c.id = s.comment_id AND c.ai_hidden_at IS NULL";

/** 이번 달 적립 완료한 사람 수 + 최근 기록 */
export async function savingsSummary(room: string, now = new Date(), limit = 10): Promise<{ count: number; recent: SavingsEntry[] }> {
  const month = kstMonth(now);
  const [{ n }] = (await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM savings_logs s ${VISIBLE} WHERE s.room_slug = $1 AND s.month = $2::date`,
    [room, month],
  )) as [{ n: number }];
  const rows = await query<Omit<SavingsEntry, "streak">>(
    `SELECT s.nickname, s.author_key, s.month::text AS month, s.bucket, s.note, s.comment_id::text AS comment_id FROM savings_logs s ${VISIBLE}
      WHERE s.room_slug = $1 AND s.month = $2::date ORDER BY s.updated_at DESC LIMIT $3`,
    [room, month, limit],
  );
  const recent = await Promise.all(rows.map(async (r) => ({ ...r, streak: monthStreakAt(await monthsOf(room, r.author_key, month), month) })));
  return { count: n, recent };
}
