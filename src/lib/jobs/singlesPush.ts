/**
 * 💌 미혼남녀 만남 행사 🔔 (10/26). 알림 조건에 동의한 구독에만:
 * - 맞는 행사가 모집을 시작하면 (시작일 당일, 늦게 넣었으면 다음 날까지) 한 번
 * - 모집 마감 하루 전에 한 번
 * 맞는지는 사용자가 보낸 출생연도·성별·지역으로만 본다 (src/lib/singlesEvents.ts alertMatches).
 * KST 09~21시에만 보낸다. 보낸 기록(singles_push_log)을 먼저 남기고 보내서 여러 번 돌아도 한 번만.
 */
import { pool } from "../db";
import { sendPush, type PushMessage, type SendResult } from "../push";
import { kstHm, mdLabel } from "../instructorRoom";
import { listSinglesEvents } from "../repo/singlesEvents";
import { SINGLES_PATH, alertMatches, closesTomorrow, opensNow, singlesEventPath, todayKst, type AlertCriteria, type SinglesEvent } from "../singlesEvents";

const LOCK_KEY = 4_823_192;
type Kind = "open" | "closing";
type Sub = { subscription_id: string; endpoint: string; p256dh: string; auth: string; birth_year: number | null; gender: "male" | "female" | null; areas: string[] };

export const singlesQuiet = (now: Date) => {
  const h = Number(kstHm(now).slice(0, 2));
  return h < 9 || h >= 21;
};

export function singlesPushMessage(kind: Kind, events: SinglesEvent[]): PushMessage {
  const one = events.length === 1 ? events[0]! : null;
  const head = kind === "open" ? "💌 모집 시작" : "💌 내일 마감";
  if (one)
    return {
      title: `${head} · ${one.title}`,
      body: [one.organizer, one.applyEnd ? `마감 ${mdLabel(one.applyEnd)}` : "", "원문 공지에서 신청"].filter(Boolean).join(" · "),
      url: `${singlesEventPath(one.id)}?from=push`,
      tag: `lr-singles-${kind}-${one.id}`,
    };
  return {
    title: kind === "open" ? `💌 모집을 시작한 만남 행사 ${events.length}건` : `💌 내일 마감하는 만남 행사 ${events.length}건`,
    body: events.slice(0, 2).map((e) => e.title).join(" / "),
    url: `${SINGLES_PATH}?from=push`,
    tag: `lr-singles-${kind}`,
  };
}

export async function runSinglesPush(
  now = new Date(),
  opts: { send?: (sub: Sub, msg: PushMessage) => Promise<SendResult> } = {},
): Promise<{ ran: boolean; sent: number; removed: number }> {
  if (singlesQuiet(now)) return { ran: false, sent: 0, removed: 0 };
  const today = todayKst(now);
  const due = (await listSinglesEvents({ today })).filter((e) => opensNow(e, today) || closesTomorrow(e, today));
  if (!due.length) return { ran: true, sent: 0, removed: 0 };
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, sent: 0, removed: 0 };
    let sent = 0;
    let removed = 0;
    try {
      const { rows: subs } = await client.query<Sub>(
        `SELECT s.subscription_id::text, p.endpoint, p.p256dh, p.auth, s.birth_year, s.gender, s.areas
           FROM singles_alert_subs s JOIN push_subscriptions p ON p.id = s.subscription_id ORDER BY s.subscription_id LIMIT 5000`,
      );
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      for (const s of subs) {
        const c: AlertCriteria = { birthYear: s.birth_year, gender: s.gender, areas: s.areas };
        for (const kind of ["open", "closing"] as const) {
          const pick = due.filter((e) => (kind === "open" ? opensNow(e, today) : closesTomorrow(e, today)) && alertMatches(e, c, today));
          if (!pick.length) continue;
          // 먼저 기록 (이미 보낸 행사는 빠진다)
          const { rows } = await client.query<{ event_id: string }>(
            `INSERT INTO singles_push_log (subscription_id, event_id, kind)
             SELECT $1, e, $3 FROM unnest($2::bigint[]) e
             ON CONFLICT DO NOTHING RETURNING event_id::text`,
            [s.subscription_id, pick.map((e) => e.id), kind],
          );
          const fresh = pick.filter((e) => rows.some((r) => r.event_id === e.id));
          if (!fresh.length) continue;
          const r = await send(s, singlesPushMessage(kind, fresh));
          if (r === "gone") {
            removed++;
            await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.subscription_id]);
            break;
          }
          if (r === "sent") sent++;
        }
      }
      return { ran: true, sent, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
