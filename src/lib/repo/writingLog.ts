/**
 * ✍️ 오늘 몇 자 썼다 인증 저장 (10/24). 하루 한 줄(writing_logs) + 방 수다방 댓글 한 개.
 * 같은 날 다시 보내면 그 줄과 댓글을 고친다. 댓글이 지워지거나 AI 운영이 가린 인증은 목록·순위에서 뺀다.
 */
import { heuristicAbuse, hideParams, maskPersonalInfo } from "../abuse";
import { identityKey } from "../badges";
import { query } from "../db";
import { notFound } from "../errors";
import { kstDay, streakAt, weekEnd, weekStart, weeklyTop, writingLine, WRITING_ROOMS, type WeeklyRow, type WeeklyTop } from "../writingLog";
import { createComment } from "./comments";
import { ensureRoomChat } from "./roomChat";

export type WritingEntry = { nickname: string; author_key: string; day: string; chars: number; note: string | null; streak: number; comment_id: string | null };

async function daysOf(room: string, keys: string[], until: string): Promise<Map<string, string[]>> {
  const rows = await query<{ author_key: string; days: string[] }>(
    `SELECT author_key, array_agg(day::text) AS days FROM writing_logs
      WHERE room_slug = $1 AND author_key = ANY($2::text[]) AND day <= $3::date AND day > $3::date - 400
      GROUP BY author_key`,
    [room, keys, until],
  );
  return new Map(rows.map((r) => [r.author_key, r.days]));
}

/** 오늘 인증 (닉네임·비밀번호 확인은 부르는 쪽에서). 이미 있으면 고친다 */
export async function submitWriting(
  input: { room: string; nickname: string; pin: string; chars: number; note?: string; fingerprint?: string; net?: string },
  now = new Date(),
): Promise<{ entry: WritingEntry; updated: boolean }> {
  if (!WRITING_ROOMS.has(input.room)) throw notFound("방");
  const chat = await ensureRoomChat(input.room);
  if (!chat) throw notFound("방");
  const key = identityKey(input.nickname);
  const day = kstDay(now);
  const note = maskPersonalInfo((input.note ?? "").trim()).text.slice(0, 60) || null;

  const inserted = await query(
    `INSERT INTO writing_logs (room_slug, author_key, day, nickname, chars, note) VALUES ($1, $2, $3::date, $4, $5, $6)
     ON CONFLICT (room_slug, author_key, day) DO NOTHING RETURNING 1`,
    [input.room, key, day, input.nickname, input.chars, note],
  );
  const updated = inserted.length === 0;
  let commentId: string | null = null;
  if (updated) {
    const [row] = await query<{ comment_id: string | null }>(
      `UPDATE writing_logs SET chars = $4, note = $5, nickname = $6, updated_at = now()
        WHERE room_slug = $1 AND author_key = $2 AND day = $3::date RETURNING comment_id::text`,
      [input.room, key, day, input.chars, note, input.nickname],
    );
    commentId = row?.comment_id ?? null;
  }
  const streak = streakAt((await daysOf(input.room, [key], day)).get(key) ?? [], day);
  const line = writingLine(input.chars, streak, note ?? undefined);

  if (commentId) {
    // 고친 한 줄도 처음처럼 규칙 판단 (Claude 판단은 부르는 쪽에서 다시)
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
      if (!updated) await query("DELETE FROM writing_logs WHERE room_slug = $1 AND author_key = $2 AND day = $3::date", [input.room, key, day]);
      throw err;
    }
    await query("UPDATE writing_logs SET comment_id = $4 WHERE room_slug = $1 AND author_key = $2 AND day = $3::date", [input.room, key, day, commentId]);
  }
  return { entry: { nickname: input.nickname, author_key: key, day, chars: input.chars, note, streak, comment_id: commentId }, updated };
}

const VISIBLE = "JOIN comments c ON c.id = w.comment_id AND c.ai_hidden_at IS NULL";

/** 이번 주(월~일) 많이 쓴 작가 */
export async function weeklyWriters(room: string, now = new Date(), n = 5): Promise<WeeklyTop[]> {
  const today = kstDay(now);
  const rows = await query<WeeklyRow>(
    `SELECT w.author_key, w.nickname, w.chars, w.day::text AS day, w.created_at::text AS at FROM writing_logs w ${VISIBLE}
      WHERE w.room_slug = $1 AND w.day BETWEEN $2::date AND $3::date`,
    [room, weekStart(today), weekEnd(today)],
  );
  return weeklyTop(rows, today, n);
}

/** 최근 인증 (어제·오늘) */
export async function recentWriting(room: string, now = new Date(), limit = 10): Promise<WritingEntry[]> {
  const today = kstDay(now);
  const rows = await query<Omit<WritingEntry, "streak">>(
    `SELECT w.nickname, w.author_key, w.day::text AS day, w.chars, w.note, w.comment_id::text AS comment_id FROM writing_logs w ${VISIBLE}
      WHERE w.room_slug = $1 AND w.day BETWEEN $2::date - 1 AND $2::date
      ORDER BY w.updated_at DESC LIMIT $3`,
    [room, today, limit],
  );
  const days = await daysOf(room, [...new Set(rows.map((r) => r.author_key))], today);
  return rows.map((r) => ({ ...r, streak: streakAt(days.get(r.author_key) ?? [], r.day) }));
}
