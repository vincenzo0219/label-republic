/**
 * 🔔 테니스방 알림 (10/29). 1분마다:
 * 1) 우리 동네 새 게임: 구독마다 지난 확인 이후 올라온, 고른 지역·종목 게임을 모아 한 번에 (15분에 한 번, 하루 10번까지).
 *    올린 지 2분 지난 게임부터(AI 운영이 가릴 시간), 마감·가림·지난 게임과 내가 올린 게임은 뺀다. 밤 10시~아침 8시는 모았다가 8시에.
 * 2) 공공 코트 예약 오픈: 전날 20시 "내일 오픈", 당일 여는 시각(모르면 09시) "오늘 오픈". court_open_push_log 로 한 번씩만.
 */
import { pool } from "../db";
import { sendPush, type PushMessage, type SendResult } from "../push";
import { kstYmd, quietNow } from "../instructorRoom";
import {
  TENNIS_DAILY_MAX,
  TENNIS_GAP_MS,
  courtOpenDue,
  courtOpenMessage,
  matchesTennisSub,
  tennisGameMessage,
  type CourtOpen,
  type GameAlertLine,
} from "../tennisAlerts";

const LOCK_KEY = 4_823_113;
const SETTLE_MS = 2 * 60_000;
const LOOKBACK_MS = 12 * 3600_000;
const BATCH = 500;

type Sub = {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  fingerprint: string | null;
  areas: string[];
  types: string[];
  checked_until: string;
  sent_day: string | null;
  sent_today: number;
};

type Send = (sub: { endpoint: string; p256dh: string; auth: string }, msg: PushMessage) => Promise<SendResult>;

export async function runTennisPush(now = new Date(), opts: { send?: Send } = {}): Promise<{ ran: boolean; games: number; courts: number; removed: number }> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, games: 0, courts: 0, removed: 0 };
    const send = opts.send ?? ((s, m) => sendPush(s, m));
    let removed = 0;
    const gone = async (subId: string) => {
      removed++;
      await client.query("DELETE FROM push_subscriptions WHERE id = $1", [subId]);
    };
    try {
      const t = now.toISOString();
      const today = kstYmd(now);
      let games = 0;
      // ---- 1) 우리 동네 새 게임 ----
      if (!quietNow(now)) {
        const { rows: lines } = await client.query<GameAlertLine & { created_at: string; author_fingerprint: string }>(
          `SELECT id::text, sido, sigungu, court, play_date::text AS play_date, start_time, game_type, created_at, author_fingerprint
             FROM tennis_games
            WHERE created_at > $1::timestamptz - make_interval(secs => $2) AND created_at <= $1::timestamptz - make_interval(secs => $3)
              AND closed_at IS NULL AND ai_hidden_reason IS NULL AND play_date >= $4::date
            ORDER BY created_at`,
          [t, LOOKBACK_MS / 1000, SETTLE_MS / 1000, today],
        );
        if (lines.length) {
          const { rows: subs } = await client.query<Sub>(
            `SELECT a.subscription_id::text, p.endpoint, p.p256dh, p.auth, p.fingerprint, a.areas, a.types, a.checked_until,
                    a.sent_day::text AS sent_day, a.sent_today
               FROM tennis_alert_subs a JOIN push_subscriptions p ON p.id = a.subscription_id
              WHERE (a.last_sent_at IS NULL OR a.last_sent_at <= $1::timestamptz - make_interval(secs => $2))
                AND a.checked_until < $1::timestamptz - make_interval(secs => $3)
              ORDER BY a.checked_until LIMIT $4`,
            [t, TENNIS_GAP_MS / 1000, SETTLE_MS / 1000, BATCH],
          );
          const settled = new Date(now.getTime() - SETTLE_MS).toISOString();
          for (const s of subs) {
            const sentToday = s.sent_day === today ? s.sent_today : 0;
            const pick = lines.filter(
              (g) => Date.parse(g.created_at) > Date.parse(s.checked_until) && g.author_fingerprint !== s.fingerprint && matchesTennisSub(g, s),
            );
            if (!pick.length || sentToday >= TENNIS_DAILY_MAX) {
              await client.query("UPDATE tennis_alert_subs SET checked_until = $2 WHERE subscription_id = $1", [s.subscription_id, settled]);
              continue;
            }
            const r = await send(s, tennisGameMessage(pick));
            if (r === "gone") {
              await gone(s.subscription_id);
              continue;
            }
            if (r === "sent") games++;
            await client.query(
              "UPDATE tennis_alert_subs SET last_sent_at = $2, checked_until = $3, sent_day = $4::date, sent_today = $5 WHERE subscription_id = $1",
              [s.subscription_id, t, settled, today, sentToday + 1],
            );
          }
        }
      }
      // ---- 2) 공공 코트 예약 오픈 ----
      let courts = 0;
      const { rows: opens } = await client.query<CourtOpen>(
        "SELECT id, court, sido, sigungu, open_days::int[] AS open_days, open_time, booking_url, source_url, note, last_verified::text AS last_verified, active FROM court_opens WHERE active",
      );
      for (const c of opens) {
        const due = courtOpenDue(c, now);
        if (!due) continue;
        const { rows: subs } = await client.query<{ subscription_id: string; endpoint: string; p256dh: string; auth: string }>(
          `SELECT p.id::text AS subscription_id, p.endpoint, p.p256dh, p.auth
             FROM court_open_subs s JOIN push_subscriptions p ON p.id = s.subscription_id
            WHERE s.court_id = $1 AND NOT EXISTS (
              SELECT 1 FROM court_open_push_log l WHERE l.subscription_id = s.subscription_id AND l.court_id = $1 AND l.open_day = $2::date AND l.kind = $3)
            LIMIT $4`,
          [c.id, due.openDay, due.kind, BATCH],
        );
        const msg = courtOpenMessage(c, due.kind, due.openDay);
        for (const s of subs) {
          // 먼저 적어 두고 보낸다 (실패해도 같은 알림을 다시 보내지 않는다)
          await client.query("INSERT INTO court_open_push_log (subscription_id, court_id, open_day, kind) VALUES ($1, $2, $3::date, $4) ON CONFLICT DO NOTHING", [
            s.subscription_id,
            c.id,
            due.openDay,
            due.kind,
          ]);
          const r = await send(s, msg);
          if (r === "gone") await gone(s.subscription_id);
          else if (r === "sent") courts++;
        }
      }
      return { ran: true, games, courts, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
