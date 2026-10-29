/**
 * 🔔 사람 글·댓글 알림 (10/25). 사람이 쓰면 owner_alerts 에 한 줄 남기고(켠 기기가 있을 때만) 바로 보낸다.
 * 쓰기를 늦추지 않게 기다리지 않고(fire-and-forget), 실패는 로그만. 한 기기에 60초에 한 번까지 — 그 사이 글은
 * 남은 시간 뒤(타이머)나 1분 배치(jobs/push.ts)에서 묶어서. 조용한 시간 없음 (대표님: 즉각).
 */
import { pool, query } from "../db";
import { HttpError, notFound } from "../errors";
import { sendPush, type PushMessage, type SendResult } from "../push";
import { listReports, REPORT_TYPE_LABEL, type ReportType } from "./reports";
import { excerpt, isHumanWrite, ownerAlertMessage, ownerAlertWait, type OwnerAlertItem, type OwnerWrite } from "../ownerAlert";

const LOCK_KEY = 4_823_110;
let timer: NodeJS.Timeout | null = null;
const EXISTS_ON = "EXISTS (SELECT 1 FROM push_subscriptions WHERE owner_alert)";

type Target = { kind: "post"; postId: string; title: string } | { kind: "comment"; postId: string; commentId: string; body: string } | { kind: "gig"; gigId: string; text: string; room?: string; url?: string };

/** 쓴 글 한 건을 남긴다. 켠 기기가 없으면 아무것도 안 남는다 */
export async function recordOwnerAlert(w: OwnerWrite, t: Target): Promise<number> {
  if (t.kind === "gig") {
    const rows = await query(
      `INSERT INTO owner_alerts (kind, room, nickname, excerpt, url) SELECT 'gig', $4, $1, $2, $3 WHERE ${EXISTS_ON} RETURNING id`,
      [w.nickname, excerpt(t.text), t.url ?? `/gigs/${t.gigId}`, t.room ?? "📋 대강·구인"],
    );
    return rows.length;
  }
  const rows = await query(
    `INSERT INTO owner_alerts (kind, room, nickname, excerpt, url)
     SELECT $1, c.name, $2, $3, $4 FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.id = $5 AND ${EXISTS_ON} RETURNING id`,
    t.kind === "post"
      ? ["post", w.nickname, excerpt(t.title), `/posts/${t.postId}`, t.postId]
      : ["comment", w.nickname, excerpt(t.body), `/posts/${t.postId}#c${t.commentId}`, t.postId],
  );
  return rows.length;
}

type Send = (sub: Sub, msg: PushMessage) => Promise<SendResult>;
let defaultSend: Send = (s, m) => sendPush(s, m);
const pending = new Set<Promise<unknown>>();
/** 테스트용: 실제 푸시 대신 보낼 함수 */
export function setOwnerAlertSend(fn: Send | null): void {
  defaultSend = fn ?? ((s, m) => sendPush(s, m));
}
/** 테스트용: 진행 중인 알림 처리가 끝날 때까지 기다리고, 예약된 재시도를 지운다 */
export async function ownerAlertIdle(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * 🚩 신고가 들어오면 부른다 (10/29 대표님 "신고하면 가려지는게 아니라 나한테 보고"). 사람 글 알림과 같은 길로,
 * 켠 기기가 있을 때만 남기고 보낸다. 기다리지 않고, 던지지 않는다. 기기가 없어도 /admin 🚩 신고 칸에는 보인다.
 */
export function reportAlertAfter(type: ReportType, id: string, reason: string): void {
  const p = listReports({ type, id, days: 1, limit: 1 })
    .then(async ([r]) => {
      if (!r) return 0;
      const rows = await query(
        `INSERT INTO owner_alerts (kind, room, nickname, excerpt, url) SELECT 'report', $1, $2, $3, $4 WHERE ${EXISTS_ON} RETURNING id`,
        [r.room, `${REPORT_TYPE_LABEL[type]} ${r.reports}건`, excerpt(`${reason ? `${reason} · ` : ""}${r.text}`), r.url],
      );
      return rows.length;
    })
    .then((n) => (n ? flushOwnerAlerts() : null))
    .catch((err) => console.error("[owner-alert] 신고", err))
    .finally(() => pending.delete(p));
  pending.add(p);
}

/** 글·댓글을 만든 직후 부른다. 사람 글만, 기다리지 않고, 던지지 않는다 */
export function ownerAlertAfter(w: OwnerWrite, t: Target): void {
  if (!isHumanWrite(w)) return;
  const p = recordOwnerAlert(w, t)
    .then((n) => (n ? flushOwnerAlerts() : null))
    .catch((err) => console.error("[owner-alert]", err))
    .finally(() => pending.delete(p));
  pending.add(p);
}

function flushLater(ms: number) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushOwnerAlerts().catch((err) => console.error("[owner-alert]", err));
  }, ms + 500);
  timer.unref();
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; owner_seen_id: string; owner_sent_at: string | null };

/** 켠 기기마다 아직 안 보낸 소식을 묶어 보낸다. 60초가 안 지난 기기는 남은 시간 뒤에 다시 */
export async function flushOwnerAlerts(
  now = new Date(),
  opts: { send?: Send; noTimer?: boolean } = {},
): Promise<{ ran: boolean; sent: number; waitMs: number }> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    // 다른 곳에서 보내는 중이면 잠시 뒤에 (그쪽이 이미 읽은 뒤 들어온 글을 놓치지 않게)
    if (!lock.rows[0]!.ok) {
      if (!opts.noTimer) flushLater(2_000);
      return { ran: false, sent: 0, waitMs: 0 };
    }
    let sent = 0;
    let waitMs = 0;
    try {
      const { rows: subs } = await client.query<Sub>(
        "SELECT id::text, endpoint, p256dh, auth, owner_seen_id::text, owner_sent_at FROM push_subscriptions WHERE owner_alert",
      );
      if (!subs.length) return { ran: true, sent: 0, waitMs: 0 };
      const from = Math.min(...subs.map((s) => Number(s.owner_seen_id)));
      const { rows: items } = await client.query<OwnerAlertItem>(
        "SELECT id::text, kind, room, nickname, excerpt, url FROM owner_alerts WHERE id > $1 ORDER BY id LIMIT 500",
        [from],
      );
      const send = opts.send ?? defaultSend;
      for (const s of subs) {
        const mine = items.filter((i) => Number(i.id) > Number(s.owner_seen_id));
        if (!mine.length) continue;
        const wait = ownerAlertWait(s.owner_sent_at ? new Date(s.owner_sent_at) : null, now);
        if (wait > 0) {
          waitMs = waitMs ? Math.min(waitMs, wait) : wait;
          continue;
        }
        const r = await send(s, ownerAlertMessage(mine));
        if (r === "gone") {
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
          continue;
        }
        if (r === "sent") sent++;
        else console.error("[owner-alert] 발송 실패", s.id);
        // 실패해도 같은 소식을 다시 보내지 않는다
        await client.query("UPDATE push_subscriptions SET owner_seen_id = $2, owner_sent_at = $3 WHERE id = $1", [s.id, mine[mine.length - 1]!.id, now.toISOString()]);
      }
      await client.query("DELETE FROM owner_alerts WHERE created_at < $1::timestamptz - interval '1 day'", [now.toISOString()]);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
    if (waitMs && !opts.noTimer) flushLater(waitMs);
    return { ran: true, sent, waitMs };
  } finally {
    client.release();
  }
}

async function ownerSub(endpoint: string): Promise<Sub & { owner_alert: boolean }> {
  const [row] = await query<Sub & { owner_alert: boolean }>(
    "SELECT id::text, endpoint, p256dh, auth, owner_seen_id::text, owner_sent_at, owner_alert FROM push_subscriptions WHERE endpoint = $1",
    [endpoint],
  );
  if (!row) throw notFound("알림 구독");
  return row;
}

/** 관리자(/admin): 이 기기의 사람 글·댓글 알림 켜기/끄기/확인. 켤 때부터의 글만 */
export async function setOwnerAlert(endpoint: string, on: boolean | null): Promise<boolean> {
  const s = await ownerSub(endpoint);
  if (on === null) return s.owner_alert;
  await query(
    `UPDATE push_subscriptions SET owner_alert = $2,
       owner_seen_id = CASE WHEN $2 AND NOT owner_alert THEN (SELECT coalesce(max(id), 0) FROM owner_alerts) ELSE owner_seen_id END
     WHERE id = $1`,
    [s.id, on],
  );
  return on;
}

/** 관리자: 이 기기로 테스트 알림 */
export async function testOwnerAlert(endpoint: string): Promise<SendResult> {
  const s = await ownerSub(endpoint);
  const r = await sendPush(s, { title: "✍️ 테스트 알림 · 노방장", body: "사람이 글·댓글을 쓰면 이렇게 바로 알려 드려요.", url: "/admin", tag: "lr-owner-test" });
  if (r === "gone") {
    await query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
    throw new HttpError(410, "push_gone", "이 기기의 알림 구독이 없어졌어요. 다시 켜 주세요.");
  }
  return r;
}

/** 관리자 화면: 켠 기기 수 */
export async function ownerAlertDevices(): Promise<number> {
  const [row] = await query<{ n: number }>("SELECT count(*)::int AS n FROM push_subscriptions WHERE owner_alert");
  return row?.n ?? 0;
}
