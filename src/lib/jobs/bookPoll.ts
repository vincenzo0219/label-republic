/** 📚 오늘의 책 질문 글을 책방에 하루 한 번 올린다 (Sprint 76). seed_key bookpoll:날짜 로 한 번만 */
import { AI_AUTHOR } from "../aiMark";
import { BOOK_ROOM_SLUG } from "../books";
import { BOOK_POLL_START, bookPollTopic } from "../bookPoll";
import { query } from "../db";
import { reportError } from "../error-tracking";
import { kstDay } from "../metrics";

export async function runBookPoll(day = kstDay()): Promise<string | null> {
  if (day < BOOK_POLL_START) return null;
  const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [BOOK_ROOM_SLUG]);
  if (!cat) return null;
  const [a, b] = bookPollTopic(day);
  const rows = await query<{ id: string }>(
    `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
     VALUES ($1, $2, 'book-poll', $3, $4, $5, 'book-poll', 'chat') ON CONFLICT (seed_key) DO NOTHING RETURNING id::text`,
    [cat.id, AI_AUTHOR, `📚 ${a} vs ${b}`, "버튼 하나로 투표하면 바로 결과가 보여요. 이유는 댓글로 (선택)", `bookpoll:${day}`],
  );
  return rows[0]?.id ?? null;
}

export function startBookPollScheduler(intervalMs = 15 * 60_000): () => void {
  const tick = () =>
    runBookPoll().catch((err) => {
      console.error("[book-poll] failed:", (err as Error).message);
      reportError(err, { kind: "job", where: "book-poll" });
    });
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
