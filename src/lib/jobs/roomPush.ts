/**
 * 🆕 내 방 새 글 알림 (10/25, 다음 날 다시 오는 이유). 내 방 알림을 켠 구독마다, 서버에 보낸 내 방 목록에 새 글이 올라오면
 * "🆕 러닝 덕후방 새 글: 제목" 한 통. 푸시 배치(10분마다)에 붙어 돈다.
 * - 사람 글·운영 글 모두. 방 채팅 줄(댓글), 오늘의 질문·책 질문·AI 토론 같은 매일 자동 글, 동네 체험·장사방 자동 안내는 뺀다
 * - 방마다 6시간에 한 번, 구독마다 하루(KST) 3번까지. 한 번 돌 때 구독마다 한 통만 (여러 방이면 다음 차례에)
 * - 내가 쓴 글은 빼고(fingerprint), 올린 지 2분 지난 글부터 (AI 운영이 가릴 시간)
 * - 조용한 시간 KST 22:00~08:00 에는 보내지 않는다 (아침에 가장 최근 글 한 통)
 */
import { pool } from "../db";
import { sendPush, type PushMessage, type SendResult } from "../push";

const LOCK_KEY = 4_823_120;
export const ROOM_GAP_HOURS = 6;
export const ROOM_DAILY_MAX = 3;
const SETTLE_MS = 2 * 60_000;
/** 오래 못 돌았거나 방금 켠 구독도 하루 전 글까지만 */
const LOOKBACK_MS = 24 * 3600_000;
const BATCH = 500;
const TITLE_CHARS = 30;

/** 알림에서 빼는 자동 글 (posts.moderated_by): 방 채팅 글, 매일 자동 질문·토론, 동네 체험 글, 장사방 자동 안내 */
export const AUTO_POST_SOURCES = ["room-chat", "room-poll", "book-poll", "ai-debate", "ibol", "shop-room"] as const;

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; fingerprint: string | null; my_rooms: string[]; room_checked_until: string };
export type RoomPost = { id: string; title: string; slug: string; room: string; created_at: string };

/** "🆕 러닝 덕후방 새 글: 11월 대회 나가는 분?" — 제목은 30자까지 */
export function roomPushMessage(p: Pick<RoomPost, "id" | "title" | "slug" | "room">): PushMessage {
  const chars = [...p.title.replace(/\s+/g, " ").trim()];
  const title = chars.length > TITLE_CHARS ? `${chars.slice(0, TITLE_CHARS).join("")}…` : chars.join("");
  return { title: `🆕 ${p.room} 새 글: ${title}`, body: "", url: `/posts/${p.id}?from=push`, tag: `lr-room-${p.slug}` };
}

/** KST 오늘 0시 (UTC 시각) */
export function kstDayStart(now: Date): Date {
  const k = now.getTime() + 9 * 3600_000;
  return new Date(k - (k % 86_400_000) - 9 * 3600_000);
}

export const roomQuietNow = (now: Date) => {
  const h = (now.getUTCHours() + 9) % 24;
  return h < 8 || h >= 22;
};

export async function runRoomPush(
  now = new Date(),
  opts: { send?: (sub: Sub, msg: PushMessage) => Promise<SendResult> } = {},
): Promise<{ ran: boolean; sent: number; removed: number }> {
  if (roomQuietNow(now)) return { ran: false, sent: 0, removed: 0 };
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, sent: 0, removed: 0 };
    let sent = 0;
    let removed = 0;
    try {
      const t = now.toISOString();
      const { rows } = await client.query<Sub>(
        `SELECT id::text, endpoint, p256dh, auth, fingerprint, my_rooms, room_checked_until FROM push_subscriptions
          WHERE room_alerts AND cardinality(my_rooms) > 0 ORDER BY room_checked_until LIMIT $1`,
        [BATCH],
      );
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      const done = (id: string) => client.query("UPDATE push_subscriptions SET room_checked_until = $2 WHERE id = $1", [id, t]);
      for (const s of rows) {
        const [today] = (
          await client.query<{ n: number }>("SELECT count(*)::int AS n FROM room_push_log WHERE subscription_id = $1 AND sent_at >= $2", [s.id, kstDayStart(now).toISOString()])
        ).rows;
        if ((today?.n ?? 0) >= ROOM_DAILY_MAX) {
          await done(s.id);
          continue;
        }
        const from = new Date(Math.max(Date.parse(s.room_checked_until), now.getTime() - LOOKBACK_MS)).toISOString();
        // 방마다 가장 최근 새 글 하나 (6시간 안에 그 방 알림을 보냈으면 그 방은 건너뛴다)
        const cands = (
          await client.query<RoomPost>(
            `SELECT * FROM (
               SELECT DISTINCT ON (c.slug) p.id::text, p.title, c.slug, c.name AS room, p.created_at
                 FROM posts p JOIN categories c ON c.id = p.category_id
                WHERE c.slug = ANY($1::text[]) AND NOT c.is_hidden
                  AND p.created_at > $2::timestamptz AND p.created_at <= $3::timestamptz - make_interval(secs => $4)
                  AND NOT p.is_blinded AND NOT p.is_suppressed
                  AND (p.moderated_by IS NULL OR p.moderated_by <> ALL($5::text[]))
                  AND ($6::text IS NULL OR p.author_fingerprint IS DISTINCT FROM $6::text)
                  AND NOT EXISTS (SELECT 1 FROM room_push_log l WHERE l.subscription_id = $7 AND l.room = c.slug
                                    AND l.sent_at > $3::timestamptz - make_interval(hours => $8))
                ORDER BY c.slug, p.created_at DESC
             ) x ORDER BY created_at DESC`,
            [s.my_rooms, from, t, SETTLE_MS / 1000, AUTO_POST_SOURCES, s.fingerprint, s.id, ROOM_GAP_HOURS],
          )
        ).rows;
        if (!cands.length) {
          await done(s.id);
          continue;
        }
        const pick = cands[0]!;
        const r = await send(s, roomPushMessage(pick));
        if (r === "gone") {
          removed++;
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
          continue;
        }
        // 실패해도 같은 글을 다시 보내지 않도록 기록은 남긴다 (그 방은 6시간 쉰다)
        await client.query("INSERT INTO room_push_log (subscription_id, room, post_id, sent_at) VALUES ($1, $2, $3, $4)", [s.id, pick.slug, pick.id, t]);
        if (r === "sent") sent++;
        // 다른 방에도 새 글이 남았으면 기준 시각을 그대로 두어 다음 차례(10분 뒤)에 보낸다
        if (cands.length === 1) await done(s.id);
      }
      await client.query("DELETE FROM room_push_log WHERE sent_at < $1::timestamptz - interval '2 days'", [t]);
      return { ran: true, sent, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
