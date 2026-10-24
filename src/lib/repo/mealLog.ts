/**
 * 🥗 오늘 식단 인증 저장 (10/24). 하루 한 줄(meal_logs) + 방 수다방 댓글 한 개 (writingLog 와 같은 흐름).
 * 같은 날 다시 보내면 그 줄과 댓글을 고친다. 댓글이 지워지거나 AI 운영이 가린 인증은 목록·순위·인원에서 뺀다.
 */
import { heuristicAbuse, hideParams, maskPersonalInfo } from "../abuse";
import { identityKey } from "../badges";
import { query, tx } from "../db";
import { z } from "zod";
import { DIET_ROOMS, MEAL_ERROR, MEAL_NOTE_MAX, MEALS, mealLine, normalizeMeals, weeklyDaysTop, type DaysTop, type DayRow, type Meal } from "../dietRoom";
import { nickname, pin } from "../validation";
import { HttpError, notFound } from "../errors";
import { roomHeuristicAbuse } from "../roomModeration";
import { kstDay, streakAt, weekEnd, weekStart } from "../writingLog";
import { createComment } from "./comments";
import { tokenOk } from "./images";
import { ensureRoomChat } from "./roomChat";

const MEAL_KEYS = MEALS.map((m) => m.key) as [Meal, ...Meal[]];

/** POST /api/meal-log 입력: 아침·점심·저녁 중 하나 이상, 간식 참음·한 줄·사진은 선택 */
export const mealSchema = z.object({
  room: z.string().max(100),
  nickname,
  pw: pin,
  meals: z.array(z.enum(MEAL_KEYS), { message: MEAL_ERROR }).min(1, MEAL_ERROR).max(MEALS.length),
  snack: z.boolean().optional(),
  note: z.string().trim().max(MEAL_NOTE_MAX, `한 줄은 ${MEAL_NOTE_MAX}자까지예요.`).optional(),
  image: z.object({ id: z.string().uuid(), token: z.string().max(200) }).optional(),
});

export type MealEntry = {
  nickname: string;
  author_key: string;
  day: string;
  meals: Meal[];
  snack: boolean;
  note: string | null;
  streak: number;
  comment_id: string | null;
};

async function daysOf(room: string, keys: string[], until: string): Promise<Map<string, string[]>> {
  const rows = await query<{ author_key: string; days: string[] }>(
    `SELECT author_key, array_agg(day::text) AS days FROM meal_logs
      WHERE room_slug = $1 AND author_key = ANY($2::text[]) AND day <= $3::date AND day > $3::date - 400
      GROUP BY author_key`,
    [room, keys, until],
  );
  return new Map(rows.map((r) => [r.author_key, r.days]));
}

/** 이미 있는 인증 댓글에 새 사진을 붙인다 (방금 올린, 아직 어디에도 안 붙은 사진만) */
async function attachImage(commentId: string, image: { id: string; token: string }): Promise<void> {
  await tx(async (client) => {
    const img = await client.query("SELECT id FROM post_images WHERE id = $1 AND post_id IS NULL AND comment_id IS NULL FOR UPDATE", [image.id]);
    if (!img.rows[0] || !tokenOk(image.id, image.token)) throw new HttpError(400, "image_expired", "사진을 찾을 수 없어요. 다시 올려 주세요.");
    const c = await client.query<{ post_id: string }>("UPDATE comments SET image_id = $2 WHERE id = $1 RETURNING post_id::text", [commentId, image.id]);
    if (c.rows[0]) await client.query("UPDATE post_images SET post_id = $2, comment_id = $3, attached_at = now() WHERE id = $1", [image.id, c.rows[0].post_id, commentId]);
  });
}

/** 오늘 인증 (닉네임·비밀번호 확인은 부르는 쪽에서). 이미 있으면 고친다 */
export async function submitMeal(
  input: {
    room: string;
    nickname: string;
    pin: string;
    meals: readonly string[];
    snack?: boolean;
    note?: string;
    image?: { id: string; token: string };
    fingerprint?: string;
    net?: string;
  },
  now = new Date(),
): Promise<{ entry: MealEntry; updated: boolean }> {
  if (!DIET_ROOMS.has(input.room)) throw notFound("방");
  const meals = normalizeMeals(input.meals);
  if (meals.length === 0) throw new HttpError(400, "invalid_body", MEAL_ERROR);
  const chat = await ensureRoomChat(input.room);
  if (!chat) throw notFound("방");
  const key = identityKey(input.nickname);
  const day = kstDay(now);
  const snack = !!input.snack;
  const note = maskPersonalInfo((input.note ?? "").trim()).text.slice(0, MEAL_NOTE_MAX) || null;
  const has = (m: Meal) => meals.includes(m);
  const vals = [input.room, key, day, input.nickname, has("breakfast"), has("lunch"), has("dinner"), snack, note];

  const inserted = await query(
    `INSERT INTO meal_logs (room_slug, author_key, day, nickname, breakfast, lunch, dinner, snack_skip, note)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (room_slug, author_key, day) DO NOTHING RETURNING 1`,
    vals,
  );
  const updated = inserted.length === 0;
  let commentId: string | null = null;
  if (updated) {
    const [row] = await query<{ comment_id: string | null }>(
      `UPDATE meal_logs SET nickname = $4, breakfast = $5, lunch = $6, dinner = $7, snack_skip = $8, note = $9, updated_at = now()
        WHERE room_slug = $1 AND author_key = $2 AND day = $3::date RETURNING comment_id::text`,
      vals,
    );
    commentId = row?.comment_id ?? null;
  }
  const streak = streakAt((await daysOf(input.room, [key], day)).get(key) ?? [], day);
  const line = mealLine(meals, streak, snack, note);

  if (commentId) {
    // 고친 한 줄도 처음처럼 규칙 판단 (Claude 판단은 부르는 쪽에서 다시)
    const abuse = heuristicAbuse(line) ?? roomHeuristicAbuse(input.room, line);
    await query("UPDATE comments SET body = $2 WHERE id = $1", [commentId, line]);
    if (abuse)
      await query(
        `UPDATE comments SET ai_hidden_reason = $2, ai_hidden_note = $3, ai_hidden_model = $4, ai_hidden_at = now()
          WHERE id = $1 AND ai_hidden_at IS NULL AND NOT ai_hide_released`,
        [commentId, ...hideParams(abuse)],
      );
    if (input.image) await attachImage(commentId, input.image);
  } else {
    try {
      const c = await createComment(chat.postId, { nickname: input.nickname, pin: input.pin, body: line, image: input.image, fingerprint: input.fingerprint, net: input.net });
      commentId = String(c.id);
    } catch (err) {
      if (!updated) await query("DELETE FROM meal_logs WHERE room_slug = $1 AND author_key = $2 AND day = $3::date", [input.room, key, day]);
      throw err;
    }
    await query("UPDATE meal_logs SET comment_id = $4 WHERE room_slug = $1 AND author_key = $2 AND day = $3::date", [input.room, key, day, commentId]);
  }
  return { entry: { nickname: input.nickname, author_key: key, day, meals, snack, note, streak, comment_id: commentId }, updated };
}

const VISIBLE = "JOIN comments c ON c.id = m.comment_id AND c.ai_hidden_at IS NULL";

export type MealSummary = { today: number; top: DaysTop[]; recent: MealEntry[] };

/** 오늘 인증한 사람 수 + 이번 주(월~일) 꾸준왕 5명 + 어제·오늘 인증 */
export async function mealSummary(room: string, now = new Date(), limit = 10): Promise<MealSummary> {
  const today = kstDay(now);
  const [week, rows] = await Promise.all([
    query<DayRow>(
      `SELECT m.author_key, m.nickname, m.day::text AS day, m.created_at::text AS at FROM meal_logs m ${VISIBLE}
        WHERE m.room_slug = $1 AND m.day BETWEEN $2::date AND $3::date`,
      [room, weekStart(today), weekEnd(today)],
    ),
    query<{ nickname: string; author_key: string; day: string; breakfast: boolean; lunch: boolean; dinner: boolean; snack: boolean; note: string | null; comment_id: string | null }>(
      `SELECT m.nickname, m.author_key, m.day::text AS day, m.breakfast, m.lunch, m.dinner, m.snack_skip AS snack, m.note, m.comment_id::text AS comment_id
         FROM meal_logs m ${VISIBLE}
        WHERE m.room_slug = $1 AND m.day BETWEEN $2::date - 1 AND $2::date
        ORDER BY m.updated_at DESC LIMIT $3`,
      [room, today, limit],
    ),
  ]);
  const days = await daysOf(room, [...new Set(rows.map((r) => r.author_key))], today);
  const recent = rows.map(({ breakfast, lunch, dinner, ...r }) => ({
    ...r,
    meals: normalizeMeals([breakfast && "breakfast", lunch && "lunch", dinner && "dinner"]),
    streak: streakAt(days.get(r.author_key) ?? [], r.day),
  }));
  return { today: new Set(week.filter((r) => r.day === today).map((r) => r.author_key)).size, top: weeklyDaysTop(week, today), recent };
}
