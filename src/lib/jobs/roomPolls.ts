/** 🗳 방마다 오늘의 질문 글을 하루 한 번 올린다 (Sprint 83). 숨긴 방은 쉰다 */
import { query } from "../db";
import { reportError } from "../error-tracking";
import { kstDay } from "../metrics";
import { ROOM_POLLS, roomPollTopic } from "../roomPolls";

export async function runRoomPolls(day = kstDay()): Promise<string[]> {
  const posted: string[] = [];
  for (const [slug, set] of Object.entries(ROOM_POLLS)) {
    if (day < set.start) continue;
    const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1 AND NOT is_hidden", [slug]);
    const topic = roomPollTopic(slug, day);
    if (!cat || !topic) continue;
    const rows = await query<{ id: string }>(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
       VALUES ($1, $2, 'room-poll', $3, $4, $5, 'room-poll', 'chat') ON CONFLICT (seed_key) DO NOTHING RETURNING id::text`,
      [cat.id, set.host, `${set.emoji} ${topic[0]} vs ${topic[1]}`, "버튼 하나로 투표하면 바로 결과가 보여요. 이유는 댓글로 (선택)", `roompoll:${slug}:${day}`],
    );
    if (rows[0]) posted.push(rows[0].id);
  }
  return posted;
}

export function startRoomPollScheduler(intervalMs = 15 * 60_000): () => void {
  const tick = () =>
    runRoomPolls().catch((err) => {
      console.error("[room-poll] failed:", (err as Error).message);
      reportError(err, { kind: "job", where: "room-poll" });
    });
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
