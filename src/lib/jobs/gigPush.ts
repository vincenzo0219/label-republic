/**
 * 📋 대강·구인 🔔 지역 알림 (10/25, 🧘 요가·필라테스 강사방). 1분마다:
 * - 구독마다 지난 확인 이후 올라온, 고른 지역·수업에 맞는 글을 모아 한 번에 보낸다 (한 건이면 그 글로, 여러 건이면 게시판으로)
 * - 한 구독에 15분에 한 번, 하루 20번까지 (그 사이 글은 모였다가 다음에)
 * - 조용한 시간 KST 22:00~08:00: 보내지 않고 모았다가 08시에. 단 06~08시에는 오늘 수업이 남은 당일 급구만 먼저
 * - 올린 지 2분 지난 글부터 (AI 운영이 가릴 시간), 마감·가림·날짜 지난 글은 빼고
 * 보낸 뒤 checked_until 을 옮기므로 여러 번 돌아도 같은 글을 두 번 보내지 않는다.
 */
import { pool } from "../db";
import { sendPush, type PushMessage, type SendResult } from "../push";
import { gigOffToken } from "../repo/gigs";
import {
  BOARD_PATH,
  areaMatches,
  isUrgent,
  kstYmd,
  mdLabel,
  payLabel,
  quietNow,
  urgentWindowNow,
  weekdayLabel,
  type GigKind,
} from "../instructorRoom";

const LOCK_KEY = 4_823_098;
export const GIG_GAP_MS = 15 * 60_000;
export const GIG_DAILY_MAX = 20;
const SETTLE_MS = 2 * 60_000;
const LOOKBACK_MS = 12 * 3600_000;
const BATCH = 500;

type Sub = {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  areas: string[];
  classes: string[];
  checked_until: string;
  last_sent_at: string | null;
  sent_ids: string[];
  sent_day: string | null;
  sent_today: number;
};

export type GigLine = {
  id: string;
  kind: GigKind;
  sido: string;
  sigungu: string;
  station: string;
  dates: string[];
  weekdays: number[];
  times: string[];
  class_type: string;
  pay: number | null;
  created_at: string;
};

const place = (g: GigLine) => g.sigungu || g.station || g.sido;
const when = (g: GigLine) => (g.dates.length ? g.dates.slice(0, 2).map(mdLabel).join(",") : g.weekdays.length ? `매주 ${weekdayLabel(g.weekdays)}` : "");
const summary = (g: GigLine) => [when(g), g.times[0], g.class_type, payLabel(g.pay)].filter(Boolean).join(" · ");

/** 알림 문구. 한 건이면 그 글로, 여러 건이면 게시판으로. u = 한 번 눌러 끄는 증표 */
export function gigPushMessage(items: GigLine[], subId: string, now: Date): PushMessage {
  const u = encodeURIComponent(gigOffToken(subId));
  const one = items.length === 1 ? items[0]! : null;
  const urgent = items.some((g) => isUrgent(g, now));
  if (one)
    return {
      title: `${urgent ? "🔥 오늘 급구" : one.kind === "sub" ? "📋 새 대강" : "📋 새 구인"} · ${place(one)}`,
      body: summary(one),
      url: `/gigs/${one.id}?from=push&u=${u}`,
      tag: `lr-gig-${one.id}`,
    };
  return {
    title: `${urgent ? "🔥 " : "📋 "}내 지역 새 대강·구인 ${items.length}건`,
    body: items.slice(0, 2).map((g) => `${place(g)} ${summary(g)}`).join(" / "),
    url: `${BOARD_PATH}?from=push&u=${u}`,
    tag: "lr-gigs",
  };
}

export const matchesSub = (g: GigLine, s: { areas: string[]; classes: string[] }) =>
  s.areas.some((a) => areaMatches(a, g.sido, g.sigungu)) && (s.classes.length === 0 || s.classes.includes(g.class_type));

export async function runGigPush(
  now = new Date(),
  opts: { send?: (sub: Sub, msg: PushMessage) => Promise<SendResult> } = {},
): Promise<{ ran: boolean; sent: number; removed: number }> {
  const quiet = quietNow(now);
  // 22~06시: 아무것도 보내지 않는다 (모였다가 다음에)
  if (quiet && !urgentWindowNow(now)) return { ran: false, sent: 0, removed: 0 };
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, sent: 0, removed: 0 };
    let sent = 0;
    let removed = 0;
    try {
      const t = now.toISOString();
      const today = kstYmd(now);
      const { rows: gigs } = await client.query<GigLine>(
        `SELECT id::text, kind, sido, sigungu, station, dates::text[] AS dates, weekdays::int[] AS weekdays, times, class_type, pay, created_at
           FROM gig_listings
          WHERE created_at > $1::timestamptz - make_interval(secs => $2) AND created_at <= $1::timestamptz - make_interval(secs => $3)
            AND closed_at IS NULL AND ai_hidden_reason IS NULL AND expires_on >= $4::date
          ORDER BY created_at`,
        [t, LOOKBACK_MS / 1000, SETTLE_MS / 1000, today],
      );
      if (!gigs.length) return { ran: true, sent: 0, removed: 0 };
      const { rows: subs } = await client.query<Sub>(
        `SELECT g.subscription_id::text, p.endpoint, p.p256dh, p.auth, g.areas, g.classes, g.checked_until, g.last_sent_at,
                g.sent_ids::text[] AS sent_ids, g.sent_day::text AS sent_day, g.sent_today
           FROM gig_alert_subs g JOIN push_subscriptions p ON p.id = g.subscription_id
          WHERE (g.last_sent_at IS NULL OR g.last_sent_at <= $1::timestamptz - make_interval(secs => $2))
            AND g.checked_until < $1::timestamptz - make_interval(secs => $3)
          ORDER BY g.checked_until LIMIT $4`,
        [t, GIG_GAP_MS / 1000, SETTLE_MS / 1000, BATCH],
      );
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      const settled = new Date(now.getTime() - SETTLE_MS);
      const after = (a: string, b: string) => Date.parse(a) > Date.parse(b);
      for (const s of subs) {
        const sentToday = s.sent_day === today ? s.sent_today : 0;
        const fresh = gigs.filter((g) => after(g.created_at, s.checked_until) && !s.sent_ids.includes(g.id) && matchesSub(g, s));
        // 조용한 시간(06~08시)에는 오늘 급구만, 나머지는 checked_until 을 그대로 두어 08시에
        const pick = quiet ? fresh.filter((g) => isUrgent(g, now)) : fresh;
        if (!pick.length || sentToday >= GIG_DAILY_MAX) {
          if (!quiet) await client.query("UPDATE gig_alert_subs SET checked_until = $2, sent_ids = '{}' WHERE subscription_id = $1", [s.subscription_id, settled.toISOString()]);
          continue;
        }
        const r = await send(s, gigPushMessage(pick, s.subscription_id, now));
        if (r === "gone") {
          removed++;
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.subscription_id]);
          continue;
        }
        if (r === "sent") sent++;
        // 실패해도 같은 글을 다시 보내지 않는다
        if (quiet)
          await client.query(
            "UPDATE gig_alert_subs SET last_sent_at = $2, sent_ids = sent_ids || $3::bigint[], sent_day = $4::date, sent_today = $5 WHERE subscription_id = $1",
            [s.subscription_id, t, pick.map((g) => g.id), today, sentToday + 1],
          );
        else
          await client.query(
            "UPDATE gig_alert_subs SET last_sent_at = $2, checked_until = $3, sent_ids = '{}', sent_day = $4::date, sent_today = $5 WHERE subscription_id = $1",
            [s.subscription_id, t, settled.toISOString(), today, sentToday + 1],
          );
      }
      return { ran: true, sent, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
