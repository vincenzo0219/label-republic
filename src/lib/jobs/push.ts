/**
 * 푸시 알림 배치 (Sprint 16). 알림을 켠 구독마다 지난 확인 이후 관심 제품·지켜보는 글·내 댓글(답글·멘션, Sprint 30)의 새 소식을 세어,
 * 있으면 한 번에 묶어 보낸다. 한 구독에는 PUSH_MIN_GAP_SEC(기본 1시간)에 한 번까지만 보내고, 그동안의 소식은 모인다.
 * advisory lock 으로 여러 인스턴스 중 한 곳에서만 실행된다.
 */
import { formatValue } from "../products";
import { pool } from "../db";
import { config } from "../config";
import { sendPush, type PushMessage, type SendResult } from "../push";
import { postUpdateCount, productUpdateCount, watchUpdates, type WatchUpdates } from "../repo/watch";
import { guardJob } from "./guard";
import { DAILY_START, dailySet } from "../daily";
import { debateTopic } from "../debate";
import { kstDay } from "../metrics";
import { TEST_POST_IDS } from "../testPosts";
import { SAVINGS_ROOM } from "../investRooms";
import { kstMonth } from "../savingsLog";
import { runGigPush } from "./gigPush";
import { flushOwnerAlerts } from "../repo/ownerAlert";
import { runRoomPush } from "./roomPush";

const LOCK_KEY = 4_823_006;
const BATCH = 500;
const MAX_FAILS = 5;
const STALE_DAYS = 90;

export type PushBatchResult = { ran: boolean; checked: number; sent: number; removed: number };

type Sub = {
  id: string; endpoint: string; p256dh: string; auth: string; fingerprint: string | null;
  products: string[]; posts: string[]; comments: string[]; checked_until: string;
};

/** 알림 문구: 가장 많은 소식부터 두세 가지만 */
export function pushMessage(u: WatchUpdates): PushMessage {
  const newPosts = u.products.reduce((n, p) => n + p.new_posts, 0);
  const renewals = u.products.flatMap((p) => p.renewals.map((r) => ({ ...r, name: p.name })));
  const supported = u.products.reduce((n, p) => n + p.newly_supported, 0) + u.posts.reduce((n, p) => n + p.newly_supported, 0);
  // 테스트 결과 글에 달린 댓글은 "새 결과" 로 따로 — 나랑 같은 타입이 있는지 궁금해서 다시 온다 (Sprint 92)
  const testPosts = u.posts.filter((p) => TEST_POST_IDS.has(p.id) && p.new_comments > 0);
  const results = testPosts.reduce((n, p) => n + p.new_comments, 0);
  const comments = u.posts.reduce((n, p) => n + p.new_comments, 0) - results;
  const corrections = u.posts.reduce((n, p) => n + p.new_corrections, 0);
  const applied = u.posts.reduce((n, p) => n + p.applied, 0);
  const edited = u.posts.filter((p) => p.edited).length;
  const replies = u.reply_count;
  const onlyReply = replies === 1 && u.replies[0] ? u.replies[0] : null;
  const parts = [
    // 내 댓글에 온 답글·멘션이 가장 먼저 — 한 건이면 누가 무엇이라고 했는지
    onlyReply
      ? `💬 ${onlyReply.nickname}님이 ${onlyReply.kind === "reply" ? "답글" : "멘션"}: ${onlyReply.excerpt.replace(/\s+/g, " ").slice(0, 60)}`
      : replies > 1 && `💬 내 댓글에 답글·멘션 ${replies}개`,
    results && `🧪 같은 테스트에 새 결과 ${results}개 · 나랑 같은 타입은?`,
    u.like_count > 0 && `👍 내 댓글에 공감 ${u.like_count}개`,
    u.liked_by.length > 0 && `👍 ${u.liked_by.join("·")}님이 공감`,
    // 라벨 변경은 가장 먼저 — 한 건이면 무엇이 얼마나 바뀌었는지까지
    renewals.length === 1
      ? `🔄 ${renewals[0]!.attribute} 라벨 변경 ${formatValue(renewals[0]!.from)}→${formatValue(renewals[0]!.to)}${renewals[0]!.unit}`
      : renewals.length > 1 && `🔄 라벨 변경 ${renewals.length}건`,
    newPosts && `관심 제품 새 글 ${newPosts}개`,
    corrections && `정정 제안 ${corrections}건`,
    supported && `동의된 정정 제안 ${supported}건`,
    comments && `새 댓글 ${comments}개`,
    applied && `반영된 정정 ${applied}건`,
    edited && `수정된 글 ${edited}개`,
  ].filter(Boolean) as string[];
  // 한 제품·한 글의 소식뿐이면 그 이름을 제목에
  const others = u.products.filter((p) => productUpdateCount(p) > 0).length + u.posts.filter((p) => postUpdateCount(p) > 0).length;
  const single =
    others + (replies || u.like_count || u.liked_by.length ? 1 : 0) === 1
      ? (u.products.find((p) => productUpdateCount(p) > 0)?.name ?? u.posts.find((p) => postUpdateCount(p) > 0)?.title ?? onlyReply?.post_title)
      : undefined;
  return {
    title: single ? `노방장 · ${single.slice(0, 40)}` : "노방장 새 소식",
    body: parts.slice(0, 3).join(" · "),
    // 답글 하나뿐이면 그 댓글로 바로
    url:
      onlyReply && others === 0
        ? `/posts/${onlyReply.post_id}#c${onlyReply.id}`
        : !replies && others === 1 && testPosts.length === 1
          ? `/posts/${testPosts[0]!.id}`
          : "/me",
    tag: "lr-watch",
  };
}

export async function runPushBatch(
  now = new Date(),
  opts: { send?: (sub: Sub, msg: PushMessage) => Promise<SendResult> } = {},
): Promise<PushBatchResult> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, checked: 0, sent: 0, removed: 0 };
    const run = await client.query<{ id: string }>("INSERT INTO push_runs DEFAULT VALUES RETURNING id");
    let checked = 0;
    let sent = 0;
    let removed = 0;
    try {
      // 90일 동안 브라우저가 한 번도 목록을 보내지 않은 구독은 지운다 (브라우저를 안 쓰게 됨). 운영자 알림 기기는 남긴다
      const stale = await client.query("DELETE FROM push_subscriptions WHERE synced_at < $1::timestamptz - make_interval(days => $2) AND NOT owner_alert", [now.toISOString(), STALE_DAYS]);
      removed += stale.rowCount ?? 0;
      const { rows } = await client.query<Sub>(
        `SELECT id, endpoint, p256dh, auth, fingerprint, products::text[] AS products, posts::text[] AS posts, comments::text[] AS comments, checked_until
           FROM push_subscriptions
          WHERE (cardinality(products) > 0 OR cardinality(posts) > 0 OR cardinality(comments) > 0)
            AND (last_sent_at IS NULL OR last_sent_at <= $1::timestamptz - make_interval(secs => $2))
          ORDER BY checked_until LIMIT $3`,
        [now.toISOString(), config.pushMinGapSec, BATCH],
      );
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      for (const s of rows) {
        checked++;
        const u = await watchUpdates(s.products, s.posts, new Date(s.checked_until), s.fingerprint, { comments: s.comments });
        if (u.total === 0) {
          await client.query("UPDATE push_subscriptions SET checked_until = $2 WHERE id = $1", [s.id, now.toISOString()]);
          continue;
        }
        const r = await send(s, pushMessage(u));
        if (r === "sent") {
          sent++;
          await client.query("UPDATE push_subscriptions SET checked_until = $2, last_sent_at = $2, fail_count = 0 WHERE id = $1", [s.id, now.toISOString()]);
        } else if (r === "gone") {
          removed++;
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
        } else {
          const f = await client.query<{ fail_count: number }>("UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = $1 RETURNING fail_count", [s.id]);
          if ((f.rows[0]?.fail_count ?? 0) >= MAX_FAILS) {
            removed++;
            await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
          }
        }
      }
      await client.query("UPDATE push_runs SET finished_at = now(), checked = $2, sent = $3, removed = $4 WHERE id = $1", [run.rows[0]!.id, checked, sent, removed]);
      await client.query("DELETE FROM push_runs WHERE started_at < $1::timestamptz - interval '30 days'", [now.toISOString()]);
      return { ran: true, checked, sent, removed };
    } catch (err) {
      await client.query("UPDATE push_runs SET finished_at = now(), error = $2 WHERE id = $1", [run.rows[0]!.id, String(err)]).catch(() => {});
      throw err;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

const DAILY_LOCK_KEY = 4_823_070;
/** 오늘의 문제 아침 알림을 보내기 시작하는 시각 (KST) */
export const DAILY_PUSH_HOUR = 8;

export function dailyPushMessage(day: string): PushMessage {
  const set = dailySet(day);
  const [a, b] = debateTopic(day);
  return { title: `📅 오늘의 문제 #${set.no}`, body: `"${set.line.line.slice(0, 40)}" 무슨 책? · ⚖️ 오늘 토론 ${a} vs ${b}`, url: "/daily?from=push", tag: "lr-daily" };
}

/**
 * 📅 오늘의 문제 알림 (Sprint 70). KST 아침 DAILY_PUSH_HOUR 시부터, 알림을 켠 구독마다 하루 한 번.
 */
export async function runDailyPush(
  now = new Date(),
  opts: { send?: (sub: Sub, msg: PushMessage) => Promise<SendResult> } = {},
): Promise<{ ran: boolean; sent: number; removed: number }> {
  const day = kstDay(now);
  const hour = (now.getUTCHours() + 9) % 24;
  if (day < DAILY_START || hour < DAILY_PUSH_HOUR) return { ran: false, sent: 0, removed: 0 };
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [DAILY_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, sent: 0, removed: 0 };
    let sent = 0;
    let removed = 0;
    try {
      const { rows } = await client.query<Sub>(
        `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
          WHERE daily AND (daily_sent_day IS NULL OR daily_sent_day < $1::date) ORDER BY id LIMIT $2`,
        [day, BATCH],
      );
      const msg = dailyPushMessage(day);
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      for (const s of rows) {
        const r = await send(s, msg);
        if (r === "gone") {
          removed++;
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
          continue;
        }
        if (r === "sent") sent++;
        // 실패해도 그날은 다시 보내지 않는다 (아침 알림이 오후에 몰려 가지 않게)
        await client.query("UPDATE push_subscriptions SET daily_sent_day = $2::date WHERE id = $1", [s.id, day]);
      }
      return { ran: true, sent, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [DAILY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

const STREAK_LOCK_KEY = 4_823_080;
export const STREAK_PUSH_HOUR = 20;

/** 🔥 끊기기 전 알림 문구 (Sprint 80) */
export function streakPushMessage(streak: number): PushMessage {
  return {
    title: `🔥 ${streak}일 연속 기록이 오늘 끊겨요`,
    body: "오늘 질문 하나면 이어져요 · 1분",
    url: "/daily?from=streak",
    tag: "lr-streak",
  };
}

/**
 * 🔥 위험 사용자 알림 (Sprint 80, 듀오링고식). 어제까지 2일 이상 이어 왔는데 오늘 아직 안 한 구독에 KST 저녁 한 번.
 */
export async function runStreakPush(
  now = new Date(),
  opts: { send?: (sub: Sub, msg: PushMessage) => Promise<SendResult> } = {},
): Promise<{ ran: boolean; sent: number; removed: number }> {
  const day = kstDay(now);
  const hour = (now.getUTCHours() + 9) % 24;
  if (hour < STREAK_PUSH_HOUR) return { ran: false, sent: 0, removed: 0 };
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [STREAK_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, sent: 0, removed: 0 };
    let sent = 0;
    let removed = 0;
    try {
      const { rows } = await client.query<Sub & { streak: number }>(
        `SELECT id, endpoint, p256dh, auth, streak FROM push_subscriptions
          WHERE streak >= 2 AND active_day = $1::date - 1 AND (streak_push_day IS NULL OR streak_push_day < $1::date)
          ORDER BY id LIMIT $2`,
        [day, BATCH],
      );
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      for (const s of rows) {
        const r = await send(s, streakPushMessage(s.streak));
        if (r === "gone") {
          removed++;
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
          continue;
        }
        if (r === "sent") sent++;
        await client.query("UPDATE push_subscriptions SET streak_push_day = $2::date WHERE id = $1", [s.id, day]);
      }
      return { ran: true, sent, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [STREAK_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

const EVENT_LOCK_KEY = 4_823_090;

/** 🎫 새 행사 알림 문구 — 한 건이면 그 글로, 여러 건이면 첫 글로 가며 개수를 붙인다 */
export function eventPushMessage(posts: { id: string; title: string; room: string }[]): PushMessage {
  const first = posts[0]!;
  const title = first.title.replace(/^\[행사\]\s*/, "");
  return {
    title: `🎫 ${first.room} 새 행사${posts.length > 1 ? ` ${posts.length}건` : ""}`,
    body: title.slice(0, 80),
    url: `/posts/${first.id}?from=push`,
    tag: "lr-event",
  };
}

/**
 * 🎫 방별 행사 알림 (10/21). 행사 탭에서 알림을 켠 구독에, 그 방에 새로 올라온 [행사] 글을 모아 보낸다.
 * 밤(KST 22~8시)에는 보내지 않고 아침에 모아서.
 */
export async function runEventPush(
  now = new Date(),
  opts: { send?: (sub: Sub, msg: PushMessage) => Promise<SendResult> } = {},
): Promise<{ ran: boolean; sent: number; removed: number }> {
  const hour = (now.getUTCHours() + 9) % 24;
  if (hour < 8 || hour >= 22) return { ran: false, sent: 0, removed: 0 };
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [EVENT_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, sent: 0, removed: 0 };
    let sent = 0;
    let removed = 0;
    try {
      const { rows } = await client.query<Sub & { event_rooms: string[]; event_checked_until: string }>(
        `SELECT id, endpoint, p256dh, auth, event_rooms, event_checked_until FROM push_subscriptions
          WHERE cardinality(event_rooms) > 0 ORDER BY event_checked_until LIMIT $1`,
        [BATCH],
      );
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      for (const s of rows) {
        const posts = await client.query<{ id: string; title: string; room: string }>(
          `SELECT p.id::text, p.title, c.name AS room FROM posts p JOIN categories c ON c.id = p.category_id
            WHERE c.slug = ANY($1::text[]) AND p.title LIKE '[행사]%' AND NOT p.is_blinded
              AND p.created_at > $2::timestamptz AND p.created_at <= $3::timestamptz
            ORDER BY p.created_at DESC LIMIT 10`,
          [s.event_rooms, s.event_checked_until, now.toISOString()],
        );
        if (posts.rows.length === 0) {
          await client.query("UPDATE push_subscriptions SET event_checked_until = $2 WHERE id = $1", [s.id, now.toISOString()]);
          continue;
        }
        const r = await send(s, eventPushMessage(posts.rows));
        if (r === "gone") {
          removed++;
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
          continue;
        }
        if (r === "sent") sent++;
        // 실패해도 같은 행사를 다시 보내지 않는다
        await client.query("UPDATE push_subscriptions SET event_checked_until = $2 WHERE id = $1", [s.id, now.toISOString()]);
      }
      return { ran: true, sent, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [EVENT_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

const SAVINGS_LOCK_KEY = 4_823_095;
export const SAVINGS_PUSH_HOUR = 9;

/** 💰 적립일 알림 문구 (10/24) */
export function savingsPushMessage(): PushMessage {
  return { title: "💰 적립일", body: "이번 달 적립 체크", url: `/c/${encodeURIComponent(SAVINGS_ROOM)}?from=push`, tag: "lr-savings" };
}

/**
 * 💰 매달 적립일 알림 (10/24, 적립식 투자방). 고른 날(1~28일) KST 오전 9시부터, 그달 한 번.
 */
export async function runSavingsPush(
  now = new Date(),
  opts: { send?: (sub: Sub, msg: PushMessage) => Promise<SendResult> } = {},
): Promise<{ ran: boolean; sent: number; removed: number }> {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  if (kst.getUTCHours() < SAVINGS_PUSH_HOUR) return { ran: false, sent: 0, removed: 0 };
  const dom = kst.getUTCDate();
  const month = kstMonth(now);
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [SAVINGS_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, sent: 0, removed: 0 };
    let sent = 0;
    let removed = 0;
    try {
      const { rows } = await client.query<Sub>(
        `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
          WHERE savings_day = $1 AND (savings_sent_month IS NULL OR savings_sent_month < $2::date) ORDER BY id LIMIT $3`,
        [dom, month, BATCH],
      );
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      for (const s of rows) {
        const r = await send(s, savingsPushMessage());
        if (r === "gone") {
          removed++;
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
          continue;
        }
        if (r === "sent") sent++;
        await client.query("UPDATE push_subscriptions SET savings_sent_month = $2::date WHERE id = $1", [s.id, month]);
      }
      return { ran: true, sent, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [SAVINGS_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

const KIDS_LOCK_KEY = 4_823_097;
/** 접수 시작 알림을 이만큼 늦게까지는 보낸다 (서버가 잠깐 멈췄을 때). 더 늦으면 보내지 않고 끝낸다 */
const KIDS_LATE_MS = 2 * 3600_000;
export const KIDS_PRE_MS = 30 * 60_000;

/** 📍 동네 체험 🔔 문구 (10/24): 30분 전 · 접수 시작 */
export function kidsPushMessage(a: { program_id: string; program_name: string }, stage: "pre" | "start"): PushMessage {
  return {
    title: stage === "pre" ? "🔔 30분 뒤 신청 시작" : "🔔 지금 신청 시작",
    body: a.program_name.slice(0, 80),
    url: `/kids/${encodeURIComponent(a.program_id)}?from=push`,
    tag: `lr-kids-${a.program_id}-${stage}`,
  };
}

/**
 * 📍 동네 체험 🔔 (10/24). 접수 시작 30분 전에 한 번, 시작 시각에 한 번. 보낼 줄을 먼저 표시(UPDATE … RETURNING)하고
 * 보내므로 여러 번 돌거나 여러 인스턴스여도 한 번만. 30분 전 알림을 놓친 채 시작 시각이 지났으면 그건 건너뛴다.
 */
export async function runKidsPush(
  now = new Date(),
  opts: { send?: (sub: Sub, msg: PushMessage) => Promise<SendResult> } = {},
): Promise<{ ran: boolean; sent: number; removed: number }> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [KIDS_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, sent: 0, removed: 0 };
    let sent = 0;
    let removed = 0;
    try {
      const t = now.toISOString();
      // 놓친 30분 전 알림은 보내지 않고 끝낸 것으로 (시작 알림이 곧 간다)
      await client.query(
        "UPDATE kids_program_alerts SET pre_sent_at = $1 WHERE pre_sent_at IS NULL AND apply_start_at <= $1::timestamptz",
        [t],
      );
      // 너무 늦은 시작 알림도 끝낸 것으로
      await client.query(
        "UPDATE kids_program_alerts SET start_sent_at = $1 WHERE start_sent_at IS NULL AND apply_start_at < $1::timestamptz - make_interval(secs => $2)",
        [t, KIDS_LATE_MS / 1000],
      );
      const pre = await client.query<{ id: string; subscription_id: string; program_id: string; program_name: string }>(
        `UPDATE kids_program_alerts SET pre_sent_at = $1
          WHERE id IN (SELECT id FROM kids_program_alerts
                        WHERE pre_sent_at IS NULL AND apply_start_at > $1::timestamptz AND apply_start_at - make_interval(secs => $2) <= $1::timestamptz
                        ORDER BY apply_start_at LIMIT $3 FOR UPDATE SKIP LOCKED)
          RETURNING id, subscription_id, program_id, program_name`,
        [t, KIDS_PRE_MS / 1000, BATCH],
      );
      const start = await client.query<{ id: string; subscription_id: string; program_id: string; program_name: string }>(
        `UPDATE kids_program_alerts SET start_sent_at = $1
          WHERE id IN (SELECT id FROM kids_program_alerts
                        WHERE start_sent_at IS NULL AND apply_start_at <= $1::timestamptz
                        ORDER BY apply_start_at LIMIT $2 FOR UPDATE SKIP LOCKED)
          RETURNING id, subscription_id, program_id, program_name`,
        [t, BATCH],
      );
      const jobs = [...pre.rows.map((a) => ({ a, stage: "pre" as const })), ...start.rows.map((a) => ({ a, stage: "start" as const }))];
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      const gone = new Set<string>();
      for (const { a, stage } of jobs) {
        if (gone.has(a.subscription_id)) continue;
        const { rows } = await client.query<Sub>("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE id = $1", [a.subscription_id]);
        const s = rows[0];
        if (!s) continue;
        const r = await send(s, kidsPushMessage(a, stage));
        if (r === "gone") {
          removed++;
          gone.add(a.subscription_id);
          await client.query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
        } else if (r === "sent") sent++;
      }
      // 끝난 알림·오래된 프로그램 캐시 정리
      await client.query("DELETE FROM kids_program_alerts WHERE start_sent_at IS NOT NULL AND apply_start_at < $1::timestamptz - interval '7 days'", [t]);
      await client.query("DELETE FROM kids_programs WHERE fetched_at < $1::timestamptz - interval '60 days'", [t]);
      return { ran: true, sent, removed };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [KIDS_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** 🔔 접수 알림은 30분 전·시작 시각에 맞춰야 해서 1분마다 따로 */
export const KIDS_PUSH_INTERVAL_MS = 60_000;

export function startPushScheduler(intervalMs: number): () => void {
  const tick = guardJob("push", async () => {
    const r = await runPushBatch();
    if (r.sent || r.removed) console.log(`[push] 알림 ${r.sent}건 발송, 구독 ${r.removed}개 정리 (확인 ${r.checked}개)`);
    const d = await runDailyPush();
    if (d.sent || d.removed) console.log(`[push] 오늘의 문제 알림 ${d.sent}건 발송, 구독 ${d.removed}개 정리`);
    const st = await runStreakPush();
    if (st.sent || st.removed) console.log(`[push] 연속 기록 알림 ${st.sent}건 발송, 구독 ${st.removed}개 정리`);
    const ev = await runEventPush();
    if (ev.sent || ev.removed) console.log(`[push] 행사 알림 ${ev.sent}건 발송, 구독 ${ev.removed}개 정리`);
    const sv = await runSavingsPush();
    if (sv.sent || sv.removed) console.log(`[push] 적립일 알림 ${sv.sent}건 발송, 구독 ${sv.removed}개 정리`);
    // 🆕 내 방 새 글 (10/25): 방마다 6시간에 한 번, 하루 3번까지 (src/lib/jobs/roomPush.ts)
    const rm = await runRoomPush();
    if (rm.sent || rm.removed) console.log(`[push] 내 방 새 글 알림 ${rm.sent}건 발송, 구독 ${rm.removed}개 정리`);
  });
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  const kidsTick = guardJob("push-kids", async () => {
    const k = await runKidsPush();
    if (k.sent || k.removed) console.log(`[push] 동네 체험 알림 ${k.sent}건 발송, 구독 ${k.removed}개 정리`);
    // 📋 대강·구인 지역 알림 (강사방, 10/25) — 당일 급구라 1분마다
    const g = await runGigPush();
    if (g.sent || g.removed) console.log(`[push] 대강·구인 알림 ${g.sent}건 발송, 구독 ${g.removed}개 정리`);
    // 🔔 사람 글·댓글 알림 (10/25): 쓰자마자 보내고, 60초 안에 묶인 것·놓친 것은 여기서
    await flushOwnerAlerts();
  });
  const kidsTimer = setInterval(kidsTick, Math.min(intervalMs, KIDS_PUSH_INTERVAL_MS));
  kidsTimer.unref();
  return () => {
    clearInterval(timer);
    clearInterval(kidsTimer);
  };
}
