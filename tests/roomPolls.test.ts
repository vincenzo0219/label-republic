import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOM_POLLS, roomPollTopic } from "@/lib/roomPolls";
import { isAiCard } from "@/lib/aiMark";
import { vivPick } from "@/lib/vivariumTest";
import { veganPick } from "@/lib/veganTest";
import { fanPick } from "@/lib/fanTest";
import { dogPick } from "@/lib/dogTest";

describe("room polls and vivarium test (Sprint 83)", () => {
  it("rotates two-sided questions per room and knows only configured rooms", () => {
    const set = ROOM_POLLS["비바리움-덕후방"]!;
    expect(roomPollTopic("비바리움-덕후방", set.start)).toEqual(set.polls[0]);
    expect(roomPollTopic("비바리움-덕후방", "2026-10-20")).toEqual(set.polls[1]);
    expect(roomPollTopic("없는-방", "2026-10-20")).toBeNull();
    for (const s of Object.values(ROOM_POLLS)) for (const [a, b] of s.polls) expect(a).not.toBe(b);
  });

  it("picks a vegetarian type from four answers (Sprint 88)", () => {
    expect(veganPick({ meat: true, fish: true, dairyEgg: true, beyondFood: true }).key).toBe("flexi");
    expect(veganPick({ meat: false, fish: true, dairyEgg: true, beyondFood: false }).key).toBe("pesco");
    expect(veganPick({ meat: false, fish: false, dairyEgg: true, beyondFood: false }).key).toBe("lactoOvo");
    expect(veganPick({ meat: false, fish: false, dairyEgg: false, beyondFood: false }).key).toBe("vegan");
    expect(veganPick({ meat: false, fish: false, dairyEgg: false, beyondFood: true }).key).toBe("lifestyle");
    expect(ROOM_POLLS["비건-덕후방"]!.polls).toHaveLength(15);
  });

  it("picks fan and dog-owner types (Sprint 91)", () => {
    expect(fanPick({ stadium: true, away: true, analysis: false, goods: false }).key).toBe("away");
    expect(fanPick({ stadium: true, away: false, analysis: true, goods: true }).key).toBe("ultra");
    expect(fanPick({ stadium: false, away: false, analysis: true, goods: true }).key).toBe("analyst");
    expect(fanPick({ stadium: false, away: false, analysis: false, goods: true }).key).toBe("collector");
    expect(fanPick({ stadium: false, away: false, analysis: false, goods: false }).key).toBe("sofa");
    expect(dogPick({ walkTwice: true, labels: true, travel: true, photos: true }).key).toBe("labels");
    expect(dogPick({ walkTwice: true, labels: false, travel: true, photos: true }).key).toBe("travel");
    expect(dogPick({ walkTwice: true, labels: false, travel: false, photos: true }).key).toBe("walker");
    expect(dogPick({ walkTwice: false, labels: false, travel: false, photos: true }).key).toBe("photo");
    expect(dogPick({ walkTwice: false, labels: false, travel: false, photos: false }).key).toBe("home");
    expect(ROOM_POLLS["k리그-덕후방"]!.polls).toHaveLength(15);
    expect(ROOM_POLLS["반려견-덕후방"]!.polls).toHaveLength(15);
  });

  it("picks a first pet from four answers", () => {
    expect(vivPick({ space: "desk", time: "weekly", insects: true, touch: true }).key).toBe("moss");
    expect(vivPick({ space: "shelf", time: "weekly", insects: false, touch: false }).key).toBe("isopod");
    expect(vivPick({ space: "shelf", time: "daily5", insects: false, touch: true }).key).toBe("crested");
    expect(vivPick({ space: "large", time: "daily", insects: true, touch: true }).key).toBe("leopard");
    expect(vivPick({ space: "large", time: "daily", insects: true, touch: false }).key).toBe("dart");
    expect(vivPick({ space: "desk", time: "daily", insects: true, touch: false }).key).toBe("crested");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("room polls (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { runRoomPolls } = await import("@/lib/jobs/roomPolls");
  const votes = await import("@/lib/repo/debateVotes");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("posts once a day in configured, visible rooms and accepts one-tap votes", async () => {
    await query("TRUNCATE posts, categories, debate_votes RESTART IDENTITY CASCADE");
    await query("INSERT INTO categories (slug, name, description) VALUES ('비바리움-덕후방', '비바리움', '')");
    await query("INSERT INTO categories (slug, name, description, is_hidden) VALUES ('perfume-audio', '오디오', '', true)");
    const [id] = await runRoomPolls("2026-10-20");
    expect(id).toBeTruthy();
    expect(await runRoomPolls("2026-10-20")).toEqual([]);
    expect(await runRoomPolls("2026-10-01")).toEqual([]);
    const [a, b] = roomPollTopic("비바리움-덕후방", "2026-10-20")!;
    expect(await votes.voteDebate(id!, "v1", "A")).toMatchObject({ a, b, human: { A: 1, B: 0 } });
    expect((await votes.latestRoomPoll("비바리움-덕후방"))?.id).toBe(id);
    expect(await votes.latestRoomPoll("perfume-audio")).toBeNull();
  });

  it("authors room polls and book polls as 노방장, keeps the emoji title and the AI mark (10/26)", async () => {
    await query("TRUNCATE posts, categories, debate_votes RESTART IDENTITY CASCADE");
    await query("INSERT INTO categories (slug, name, description) VALUES ('비바리움-덕후방', '비바리움', ''), ('읽는-책-제목을-교환해-보자', '책방', '')");
    const [id] = await runRoomPolls("2026-10-20");
    const { runBookPoll } = await import("@/lib/jobs/bookPoll");
    const bookId = await runBookPoll("2026-10-20");
    const rows = await query<{ id: string; nickname: string; title: string; moderated_by: string; is_ai_curated: boolean }>(
      "SELECT id::text, nickname, title, moderated_by, is_ai_curated FROM posts WHERE id = ANY($1::bigint[]) ORDER BY id",
      [[id, bookId]],
    );
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.nickname).toBe("노방장");
      expect(isAiCard(r)).toBe(true);
    }
    expect(rows[0]).toMatchObject({ moderated_by: "room-poll" });
    expect(rows[0]!.title.startsWith(ROOM_POLLS["비바리움-덕후방"]!.emoji)).toBe(true);
    expect(rows[1]).toMatchObject({ moderated_by: "book-poll" });
  });

  it("096 migration renames only AI/automation card posts to 노방장", async () => {
    await query("TRUNCATE posts, categories, comments RESTART IDENTITY CASCADE");
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('비바리움-덕후방', '비바리움', '') RETURNING id");
    const ins = (nickname: string, opts: { by?: string; ai?: boolean; fp?: string } = {}) =>
      query<{ id: string }>(
        "INSERT INTO posts (category_id, nickname, pw_hash, title, body, moderated_by, is_ai_curated, author_fingerprint, post_type) VALUES ($1, $2, 'x', 't', 'b', $3, $4, $5, 'chat') RETURNING id::text",
        [cat!.id, nickname, opts.by ?? "", opts.ai ?? false, opts.fp ?? null],
      ).then((r) => r[0]!.id);
    const op = await ins("돈키호테");
    const op2 = await ins("덕후1호");
    const cur = await ins("AI 큐레이터", { ai: true, by: "ai-curator" });
    const poll = await ins("🐶 오늘의 질문", { by: "room-poll" });
    const book = await ins("📚 오늘의 질문", { by: "book-poll" });
    const human = await ins("덕후1호", { fp: "f".repeat(64) });
    const humanQ = await ins("내 오늘의 질문", { fp: "e".repeat(64) });
    const debate = await ins("토론 사회자", { ai: true, by: "ai-debate" });
    const shop = await ins("비즈파일럿", { by: "shop-room" });
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, '덕후1호', 'x', '댓글')", [op]);
    await query(readFileSync(path.join(process.cwd(), "db", "migrations", "096_unify_ai_authors.sql"), "utf8"));
    const names = Object.fromEntries(
      (await query<{ id: string; nickname: string }>("SELECT id::text, nickname FROM posts")).map((r) => [r.id, r.nickname]),
    );
    for (const id of [op, op2, cur, poll, book]) expect(names[id]).toBe("노방장");
    expect(names[human]).toBe("덕후1호");
    expect(names[humanQ]).toBe("내 오늘의 질문");
    expect(names[debate]).toBe("토론 사회자");
    expect(names[shop]).toBe("비즈파일럿");
    expect((await query<{ nickname: string }>("SELECT nickname FROM comments"))[0]!.nickname).toBe("덕후1호");
  });
});

// 💬 오늘의 썸 카톡 (10/28): 미혼남녀방은 장면 + 두 갈래, 장면 수와 질문 수가 같다
import { ROOM_POLLS as POLLS, roomPollScene as sceneOf, roomPollTopic as topicOf } from "@/lib/roomPolls";
import { pollTitle } from "@/lib/jobs/roomPolls";
describe("오늘의 썸 카톡", () => {
  it("장면과 두 갈래가 짝지어 돌아간다", () => {
    const set = POLLS["미혼남녀-만남-행사"]!;
    expect(set.scenes!.length).toBe(set.polls.length);
    expect(sceneOf("미혼남녀-만남-행사", "2026-10-28")).toContain("다음에 또 봬요");
    expect(topicOf("미혼남녀-만남-행사", "2026-10-28")).toEqual(["내가 먼저 다음 약속 잡는다", "상대가 잡길 기다린다"]);
    expect(pollTitle("미혼남녀-만남-행사", "2026-10-29", "💬", topicOf("미혼남녀-만남-행사", "2026-10-29")!)).toMatch(/^\[심리\] 💬 오늘의 썸 카톡: /);
    expect(pollTitle("k리그-덕후방", "2026-10-29", "⚽", ["직관", "중계"])).toBe("⚽ 직관 vs 중계");
  });
});

describe("오늘의 썸 카톡 시각", () => {
  it("미혼남녀방은 아침 8시(KST)부터", () => {
    expect(POLLS["미혼남녀-만남-행사"]!.hour).toBe(8);
  });
});
