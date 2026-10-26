/**
 * 🎉 덕질 기념일 축하 알림 (10/26). 기념일 카드를 올린 사람에게 "n명이 내 덕질 기념일을 축하했어요", 구독마다 하루 한 번 (KST 09~21시).
 * 글쓴이 확인: 그 구독의 지켜보는 글 목록(내가 쓴 글은 자동으로 들어감)에 있고, 구독 fingerprint 가 글쓴이와 같을 때만.
 * 지난번 알림 뒤에 다른 사람의 새 축하가 있어야 보낸다. 하루 한 번은 fan_cheer_push_log (구독, 날짜) 로 먼저 잡고 보낸다.
 */
import { pool } from "../db";
import { cheerPushTitle } from "../fanDays";
import { kstDay } from "../metrics";
import { sendPush, type PushMessage, type PushTarget, type SendResult } from "../push";

type Row = PushTarget & { subscription_id: string; post_id: string; title: string; cheers: number };

const kstHour = (now: Date) => (now.getUTCHours() + 9) % 24;

export function cheerPushMessage(r: { post_id: string; title: string; cheers: number }): PushMessage {
  return { title: cheerPushTitle(r.cheers), body: r.title.replace(/^\[[^\]]{2,4}\]\s*/, "").slice(0, 80), url: `/posts/${r.post_id}?from=push`, tag: `lr-cheer-${r.post_id}` };
}

export async function runCheerPush(
  now = new Date(),
  opts: { send?: (t: PushTarget, m: PushMessage) => Promise<SendResult> } = {},
): Promise<{ sent: number; removed: number }> {
  const h = kstHour(now);
  if (h < 9 || h >= 21) return { sent: 0, removed: 0 };
  const today = kstDay(now);
  const client = await pool().connect();
  let sent = 0;
  let removed = 0;
  try {
    const { rows } = await client.query<Row>(
      `SELECT DISTINCT ON (s.id) s.id::text AS subscription_id, s.endpoint, s.p256dh, s.auth, p.id::text AS post_id, p.title,
              (SELECT count(*)::int FROM post_cheers c WHERE c.post_id = p.id) AS cheers
         FROM push_subscriptions s
         JOIN posts p ON p.id = ANY(s.posts) AND p.author_fingerprint = s.fingerprint
        WHERE p.card_kind = 'fanday' AND NOT p.is_blinded AND p.created_at > $1::timestamptz - interval '60 days'
          AND NOT EXISTS (SELECT 1 FROM fan_cheer_push_log l WHERE l.subscription_id = s.id AND l.day = $2::date)
          AND EXISTS (SELECT 1 FROM post_cheers c
                       WHERE c.post_id = p.id AND (c.fingerprint IS NULL OR c.fingerprint <> p.author_fingerprint)
                         AND c.created_at > coalesce((SELECT max(l.sent_at) FROM fan_cheer_push_log l WHERE l.subscription_id = s.id), '-infinity'))
        ORDER BY s.id, (SELECT max(c.created_at) FROM post_cheers c WHERE c.post_id = p.id) DESC
        LIMIT 500`,
      [now.toISOString(), today],
    );
    const send = opts.send ?? ((t: PushTarget, m: PushMessage) => sendPush(t, m));
    for (const r of rows) {
      // 먼저 오늘 칸을 잡는다 (여러 인스턴스가 돌아도 하루 한 번)
      const claim = await client.query(
        "INSERT INTO fan_cheer_push_log (subscription_id, day, post_id, cheers, sent_at) VALUES ($1, $2::date, $3, $4, $5) ON CONFLICT DO NOTHING",
        [r.subscription_id, today, r.post_id, r.cheers, now.toISOString()],
      );
      if (!claim.rowCount) continue;
      const res = await send(r, cheerPushMessage(r));
      if (res === "gone") {
        removed++;
        await client.query("DELETE FROM push_subscriptions WHERE id = $1", [r.subscription_id]);
      } else if (res === "sent") sent++;
    }
    // 오래된 기록 정리 (마지막 보낸 시각만 있으면 된다)
    await client.query("DELETE FROM fan_cheer_push_log WHERE day < $1::date - 30", [today]);
    return { sent, removed };
  } finally {
    client.release();
  }
}
