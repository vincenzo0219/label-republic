/**
 * 🏪 오늘도 장사중 (10/25): 1분마다 — 비즈파일럿 피드 읽기(10분에 한 번) · 때가 된 글 올리기 · 07:30 오늘 올라올 글 공지 ·
 * 일요일 22:30 뒤 이번 주 모아 보기. 대기열은 shop_queue. SHOP_ROOM_ENABLED=0 이면 전부, SHOP_FEED_ENABLED=0 이면 피드만 끈다
 */
import { guardJob } from "./guard";
import { syncFeed } from "../repo/shopFeed";
import { postWeekRoundup, publishDue, refreshNotice } from "../repo/shopQueue";

export async function runShopRoom(now = new Date(), opts: { forceFeed?: boolean } = {}) {
  const feed = process.env.SHOP_FEED_ENABLED === "0" ? { ran: false, queued: [], errors: [] } : await syncFeed(now, { force: opts.forceFeed });
  const published = await publishDue(now);
  const notice = await refreshNotice(now);
  const week = await postWeekRoundup(now);
  if (feed.ran) console.log(`[shop-room] 피드: 넣음 ${feed.queued.length}${feed.errors.length ? ` · 문제 ${feed.errors.length}: ${feed.errors[0]}` : ""}`);
  if (published.length) console.log(`[shop-room] 올림: ${published.join(", ")}`);
  if (notice === "updated") console.log("[shop-room] 오늘 올라올 글 공지 바꿈");
  if (week) console.log(`[shop-room] 이번 주 모아 보기: ${week}`);
  return { feed, published, notice, week };
}

export function startShopRoomScheduler(intervalMs = 60_000): () => void {
  const tick = guardJob("shop-room", () => runShopRoom());
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
