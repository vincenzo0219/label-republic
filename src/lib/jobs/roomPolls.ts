/** 🗳 방마다 오늘의 질문 글을 하루 한 번 올린다 (Sprint 83). 숨긴 방은 쉰다 */
import { AI_AUTHOR } from "../aiMark";
import { query } from "../db";
import { reportError } from "../error-tracking";
import { kstDay } from "../metrics";
import { ROOM_POLLS, roomPollScene, roomPollTopic } from "../roomPolls";

/** 어제 질문의 사람 투표 결과 한 줄 (Sprint 95) — 투표한 사람이 다음 날 결과를 보러 온다. 표가 없으면 빈 줄 */
export async function yesterdayLine(slug: string, day: string): Promise<string> {
  const prev = new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const topic = roomPollTopic(slug, prev);
  if (!topic) return "";
  const [v] = await query<{ a: number; b: number }>(
    `SELECT count(*) FILTER (WHERE v.side = 'A')::int AS a, count(*) FILTER (WHERE v.side = 'B')::int AS b
       FROM posts p JOIN debate_votes v ON v.post_id = p.id WHERE p.seed_key = $1`,
    [`roompoll:${slug}:${prev}`],
  );
  const a = v?.a ?? 0, b = v?.b ?? 0;
  if (a + b === 0) return "";
  const pa = Math.round((a / (a + b)) * 100);
  const scene = roomPollScene(slug, prev);
  return `📊 어제${scene ? ` "${scene}"` : ""} 결과: ${topic[0]} ${pa}% vs ${topic[1]} ${100 - pa}% (${a + b}명)\n\n`;
}

/** "⚽ 직관 vs 중계" · 장면이 있으면 "💬 오늘의 썸 카톡: <장면>" (버튼에 두 갈래가 보인다) */
export function pollTitle(slug: string, day: string, emoji: string, topic: [string, string]): string {
  const scene = roomPollScene(slug, day);
  return scene ? `${emoji} 오늘의 썸 카톡: ${scene}` : `${emoji} ${topic[0]} vs ${topic[1]}`;
}

export async function runRoomPolls(day = kstDay(), now = new Date()): Promise<string[]> {
  const posted: string[] = [];
  // 한국 시각 (시). 오늘 날짜를 직접 넘긴 경우(테스트·지난 날)는 시각 제한을 두지 않는다
  const kstHour = day === kstDay(now) ? (now.getUTCHours() + 9) % 24 : 24;
  for (const [slug, set] of Object.entries(ROOM_POLLS)) {
    if (day < set.start) continue;
    if (set.hour !== undefined && kstHour < set.hour) continue;
    const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1 AND NOT is_hidden", [slug]);
    const topic = roomPollTopic(slug, day);
    if (!cat || !topic) continue;
    const body = (await yesterdayLine(slug, day)) + "버튼 하나로 투표하면 바로 결과가 보여요. 이유는 댓글로 (선택)";
    const rows = await query<{ id: string }>(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
       VALUES ($1, $2, 'room-poll', $3, $4, $5, 'room-poll', 'chat') ON CONFLICT (seed_key) DO NOTHING RETURNING id::text`,
      [cat.id, AI_AUTHOR, pollTitle(slug, day, set.emoji, topic), body, `roompoll:${slug}:${day}`],
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
