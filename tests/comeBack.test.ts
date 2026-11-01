import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOM_POLLS, nextRoomPollAt, roomPollTopic } from "@/lib/roomPolls";
import { investProblem } from "@/lib/investRooms";
import { untilLabel } from "@/components/RoomPoll";
import { echoLine, shouldEcho } from "@/lib/repo/testEcho";
import { FAN_INTRO_POST_ID } from "@/lib/fanTest";

// 📅 11/1 대표님 "테스트 끝에 내일 다시 올 이유" · "만남 행사와 이어폰 방식을 다른 방에도" · "테스트 결과를 그 방 수다방에도"
describe("come back tomorrow (11/1)", () => {
  it("adds a daily poll to rooms that had none, 15 two-sided questions each, no stock picks", () => {
    for (const slug of ["오늘도-장사중", "요가-필라테스-강사방", "뮤지컬-연극-덕후방", "팝업-전시-덕후방", "고양이-집사방", "캠핑-덕후방", "보드게임-방탈출-덕후방", "주식", "다이어트-식단-함께해요"]) {
      const set = ROOM_POLLS[slug]!;
      expect(set, slug).toBeTruthy();
      expect(set.polls).toHaveLength(15);
      expect(new Set(set.polls.map((p) => p.join("|"))).size).toBe(15);
      expect(roomPollTopic(slug, "2026-11-01")).toEqual(set.polls[0]);
      for (const [a, b] of set.polls) expect(investProblem(slug, a, b), `${slug}: ${a} / ${b}`).toBeNull();
    }
  });

  it("knows when the next question opens (KST midnight, or the room's hour)", () => {
    // 11/1 09:40 KST
    const now = new Date("2026-11-01T00:40:00Z");
    expect(nextRoomPollAt("k리그-덕후방", now)).toBe("2026-11-01T15:00:00.000Z");
    // 💌 만남 행사는 아침 8시 (지금은 9시 40분이라 내일 8시)
    expect(nextRoomPollAt("미혼남녀-만남-행사", now)).toBe("2026-11-01T23:00:00.000Z");
    // 새벽 6시 KST 면 오늘 8시
    expect(nextRoomPollAt("미혼남녀-만남-행사", new Date("2026-10-31T21:00:00Z"))).toBe("2026-10-31T23:00:00.000Z");
    expect(untilLabel("2026-11-01T15:00:00.000Z", Date.parse("2026-11-01T00:40:00Z"))).toBe("14시간 20분");
    expect(untilLabel("2026-11-01T15:00:00.000Z", Date.parse("2026-11-01T14:48:30Z"))).toBe("12분");
    expect(untilLabel("2026-11-01T15:00:00.000Z", Date.parse("2026-11-01T15:00:01Z"))).toBeNull();
  });

  it("echoes only a person's top-level result on a test post, as one short line", () => {
    expect(echoLine("수진", "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원\n둘째 줄")).toBe("🧪 수진님 결과 · ⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원");
    expect([...echoLine("a", "가".repeat(300))]).toHaveLength(140);
    expect(shouldEcho(FAN_INTRO_POST_ID, { fingerprint: "f" })).toBe(true);
    expect(shouldEcho(FAN_INTRO_POST_ID, { fingerprint: "f", parentId: "1" })).toBe(false);
    expect(shouldEcho(FAN_INTRO_POST_ID, { fingerprint: null })).toBe(false);
    expect(shouldEcho("999999", { fingerprint: "f" })).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("come back tomorrow (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { echoTestResult } = await import("@/lib/repo/testEcho");
  const { createComment } = await import("@/lib/repo/comments");
  const { roomRevisitStats } = await import("@/lib/metrics");
  const { roomPollOn } = await import("@/lib/repo/debateVotes");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("copies a test result into the room chat, skips replies and hidden comments", async () => {
    await query("TRUNCATE posts, categories RESTART IDENTITY CASCADE");
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('k리그-덕후방', 'K리그 덕후방', '') RETURNING id");
    await query("INSERT INTO posts (id, category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, $2, '노방장', 'x', '팬 테스트', 'b', 'chat')", [FAN_INTRO_POST_ID, cat!.id]);
    const c = await createComment(FAN_INTRO_POST_ID, { nickname: "수진", pin: "1234", body: "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원", fingerprint: "a".repeat(64) });
    const chatLines = async () => {
      for (let i = 0; i < 50; i++) {
        const rows = await query<{ nickname: string; body: string; author_fingerprint: string | null }>(
          "SELECT c.nickname, c.body, c.author_fingerprint FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.seed_key = 'roomchat:k리그-덕후방' ORDER BY c.id",
        );
        if (rows.length) return rows;
        await new Promise((r) => setTimeout(r, 40));
      }
      return [];
    };
    expect(await chatLines()).toEqual([{ nickname: "💬 수다방", body: "🧪 수진님 결과 · ⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원", author_fingerprint: null }]);
    // 답글은 옮기지 않는다
    await createComment(FAN_INTRO_POST_ID, { nickname: "울트라매니아", pin: "1234", body: "반가워요 수진님", parentId: String(c.id) });
    // 가려진 댓글도 옮기지 않는다
    const [hidden] = await query<{ id: string }>(
      "INSERT INTO comments (post_id, nickname, pw_hash, body, ai_hidden_reason, ai_hidden_at) VALUES ($1, '누군가', 'x', '결과', 'spam', now()) RETURNING id::text",
      [FAN_INTRO_POST_ID],
    );
    expect(await echoTestResult(FAN_INTRO_POST_ID, hidden!.id)).toBeNull();
    await new Promise((r) => setTimeout(r, 100));
    expect(await chatLines()).toHaveLength(1);
  });

  it("finds a room's poll for a given day", async () => {
    await query("TRUNCATE posts, categories RESTART IDENTITY CASCADE");
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('주식', '주식', '') RETURNING id");
    await query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, post_type) VALUES ($1, '노방장', 'x', 't', 'b', 'roompoll:주식:2026-10-31', 'chat')", [cat!.id]);
    expect(await roomPollOn("주식", "2026-10-31")).toMatchObject({ title: "t" });
    expect(await roomPollOn("주식", "2026-11-01")).toBeNull();
  });

  it("measures per-room revisits by distinct days and 7-day return", async () => {
    await query("TRUNCATE page_views");
    const pv = (day: string, v: string, room: string) =>
      query("INSERT INTO page_views (occurred_at, day, visitor_hash, is_returning, path, category_slug, source, is_landing) VALUES ($1::date, $1::date, $2, false, '/c/x', $3, 'direct', false)", [day, v, room]);
    // a: 10/20, 10/20, 10/25 (7일 안 재방문) · b: 10/20 만 · c: 10/30 (7일 안 지남 X → d7 에서 빠짐) · d: 10/30, 10/31
    await pv("2026-10-20", "a", "주식");
    await pv("2026-10-20", "a", "주식");
    await pv("2026-10-25", "a", "주식");
    await pv("2026-10-20", "b", "주식");
    await pv("2026-10-30", "c", "주식");
    await pv("2026-10-30", "d", "주식");
    await pv("2026-10-31", "d", "주식");
    await pv("2026-10-31", "a", "캠핑-덕후방");
    const rows = await roomRevisitStats("2026-10-19", "2026-11-01");
    expect(rows[0]).toEqual({ room: "주식", visitors: 4, returners: 2, rate: 50, d7: 50, d7Base: 2 });
    expect(rows[1]).toEqual({ room: "캠핑-덕후방", visitors: 1, returners: 0, rate: 0, d7: null, d7Base: 0 });
  });
});
