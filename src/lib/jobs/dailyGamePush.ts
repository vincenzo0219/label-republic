/**
 * 🔔 하루 한 판 게임 알림 (11/4). 1분마다:
 * 1) "오늘 문제 열렸어요": 게임마다 정한 시각(책·애니 21시, K리그 20시)부터 밤 10시 전, 오늘 아직 안 한 사람에게 하루 한 번.
 * 2) "내 기록이 깨졌어요": 오늘 내 판 다음에 누가 나보다 좋은 기록을 내면 하루 한 번 (밤 10시~아침 8시는 안 보냄).
 * 알림을 켠 사람만 (game_push_subs). 없어진 구독은 지운다.
 */
import { DAILY, DAILY_GAMES, beatenPushDue, beatenPushMessage, dailyPushDue, dailyPushMessage, type DailyGame } from "../dailyGames";
import { pool } from "../db";
import { competitionRanks } from "../gameRank";
import { kstHm } from "../instructorRoom";
import { kstDay } from "../metrics";
import { sendPush, type PushMessage, type SendResult } from "../push";

const LOCK_KEY = 4_823_207;

type Send = (sub: { endpoint: string; p256dh: string; auth: string }, msg: PushMessage) => Promise<SendResult>;

type Row = {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  visitor_hash: string;
  daily_day: string | null;
  beaten_day: string | null;
};

export async function runDailyGamePush(now = new Date(), opts: { send?: Send } = {}): Promise<{ ran: boolean; daily: number; beaten: number; removed: number }> {
  const client = await pool().connect();
  const send = opts.send ?? ((s, m) => sendPush(s, m));
  let daily = 0;
  let beaten = 0;
  let removed = 0;
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, daily, beaten, removed };
    try {
      const day = kstDay(now);
      const hm = kstHm(now);
      for (const game of DAILY_GAMES as readonly DailyGame[]) {
        const { rows: subs } = await client.query<Row>(
          `SELECT g.subscription_id::text, s.endpoint, s.p256dh, s.auth, g.visitor_hash, g.daily_day::text AS daily_day, g.beaten_day::text AS beaten_day
             FROM game_push_subs g JOIN push_subscriptions s ON s.id = g.subscription_id WHERE g.game = $1`,
          [game],
        );
        if (!subs.length) continue;
        const { rows: plays } = await client.query<{ visitor_hash: string; score: number; created_at: string }>(
          "SELECT visitor_hash, score, created_at FROM game_plays WHERE game = $1 AND day = $2 ORDER BY created_at",
          [game, day],
        );
        const first = new Map<string, { score: number; at: number }>();
        for (const p of plays) if (!first.has(p.visitor_hash)) first.set(p.visitor_hash, { score: Number(p.score), at: Date.parse(p.created_at) });
        const all = [...first.entries()];
        const low = DAILY[game].lowerBetter;
        const ranks = competitionRanks(
          all.map(([, v]) => v.score),
          low,
        );
        for (const s of subs) {
          const mine = first.get(s.visitor_hash);
          let msg: PushMessage | null = null;
          let mark: "daily_day" | "beaten_day" | null = null;
          if (dailyPushDue(game, hm, day, s.daily_day, !!mine)) {
            msg = dailyPushMessage(game, day);
            mark = "daily_day";
          } else if (mine && beatenPushDue(hm, day, s.beaten_day)) {
            // 내 판 다음에 들어온 더 좋은 기록이 있으면
            const passed = all.some(([h, v]) => h !== s.visitor_hash && v.at > mine.at && (low ? v.score < mine.score : v.score > mine.score));
            if (passed) {
              const i = all.findIndex(([h]) => h === s.visitor_hash);
              msg = beatenPushMessage(game, day, ranks[i]!);
              mark = "beaten_day";
            }
          }
          if (!msg || !mark) continue;
          // 먼저 표시해 두고 보낸다 (보내다 실패해도 같은 날 여러 번 보내지 않게)
          await client.query(`UPDATE game_push_subs SET ${mark} = $3::date WHERE subscription_id = $1 AND game = $2`, [s.subscription_id, game, day]);
          const r = await send(s, msg).catch(() => "failed" as const);
          if (r === "sent") {
            if (mark === "daily_day") daily++;
            else beaten++;
          }
          if (r === "gone") {
            removed++;
            await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.subscription_id]);
          }
        }
      }
      return { ran: true, daily, beaten, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
