/**
 * 푸시 알림 배치 (Sprint 16). 알림을 켠 구독마다 지난 확인 이후 관심 제품·지켜보는 글의 새 소식을 세어,
 * 있으면 한 번에 묶어 보낸다. 한 구독에는 PUSH_MIN_GAP_SEC(기본 1시간)에 한 번까지만 보내고, 그동안의 소식은 모인다.
 * advisory lock 으로 여러 인스턴스 중 한 곳에서만 실행된다.
 */
import { formatValue } from "../products";
import { pool } from "../db";
import { config } from "../config";
import { sendPush, type PushMessage, type SendResult } from "../push";
import { postUpdateCount, productUpdateCount, watchUpdates, type WatchUpdates } from "../repo/watch";
import { reportError } from "../error-tracking";

const LOCK_KEY = 4_823_006;
const BATCH = 500;
const MAX_FAILS = 5;
const STALE_DAYS = 90;

export type PushBatchResult = { ran: boolean; checked: number; sent: number; removed: number };

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; fingerprint: string | null; products: string[]; posts: string[]; checked_until: string };

/** 알림 문구: 가장 많은 소식부터 두세 가지만 */
export function pushMessage(u: WatchUpdates): PushMessage {
  const newPosts = u.products.reduce((n, p) => n + p.new_posts, 0);
  const renewals = u.products.flatMap((p) => p.renewals.map((r) => ({ ...r, name: p.name })));
  const supported = u.products.reduce((n, p) => n + p.newly_supported, 0) + u.posts.reduce((n, p) => n + p.newly_supported, 0);
  const comments = u.posts.reduce((n, p) => n + p.new_comments, 0);
  const corrections = u.posts.reduce((n, p) => n + p.new_corrections, 0);
  const applied = u.posts.reduce((n, p) => n + p.applied, 0);
  const edited = u.posts.filter((p) => p.edited).length;
  const parts = [
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
  const single =
    u.products.filter((p) => productUpdateCount(p) > 0).length + u.posts.filter((p) => postUpdateCount(p) > 0).length === 1
      ? (u.products.find((p) => productUpdateCount(p) > 0)?.name ?? u.posts.find((p) => postUpdateCount(p) > 0)?.title)
      : undefined;
  return {
    title: single ? `라벨공화국 · ${single.slice(0, 40)}` : "라벨공화국 새 소식",
    body: parts.slice(0, 3).join(" · "),
    url: "/me",
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
      // 90일 동안 브라우저가 한 번도 목록을 보내지 않은 구독은 지운다 (브라우저를 안 쓰게 됨)
      const stale = await client.query("DELETE FROM push_subscriptions WHERE synced_at < $1::timestamptz - make_interval(days => $2)", [now.toISOString(), STALE_DAYS]);
      removed += stale.rowCount ?? 0;
      const { rows } = await client.query<Sub>(
        `SELECT id, endpoint, p256dh, auth, fingerprint, products::text[] AS products, posts::text[] AS posts, checked_until
           FROM push_subscriptions
          WHERE (cardinality(products) > 0 OR cardinality(posts) > 0)
            AND (last_sent_at IS NULL OR last_sent_at <= $1::timestamptz - make_interval(secs => $2))
          ORDER BY checked_until LIMIT $3`,
        [now.toISOString(), config.pushMinGapSec, BATCH],
      );
      const send = opts.send ?? ((s: Sub, m: PushMessage) => sendPush(s, m));
      for (const s of rows) {
        checked++;
        const u = await watchUpdates(s.products, s.posts, new Date(s.checked_until), s.fingerprint);
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

export function startPushScheduler(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runPushBatch();
      if (r.sent || r.removed) console.log(`[push] 알림 ${r.sent}건 발송, 구독 ${r.removed}개 정리 (확인 ${r.checked}개)`);
    } catch (err) {
      console.error("[push] batch failed:", (err as Error).message);
      reportError(err, { kind: "job", where: "push" });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
