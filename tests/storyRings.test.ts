import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIRST_LOOK_MS, parseRingQuery, ringOn, ringOrder } from "@/lib/storyRings";

describe("⭕ 내 방 동그라미 (규칙)", () => {
  it("slugs·본 시각을 읽고, 이상한 이름은 버리고, 안 본 방은 하루 전부터", () => {
    const now = 1_800_000_000_000;
    const q = new URLSearchParams({ slugs: "캠핑-덕후방,a b,캠핑-덕후방,주식,%E0%A4%A", s: `${encodeURIComponent("캠핑-덕후방")}:${now - 5000},주식:${now + 99}` });
    const r = parseRingQuery(q, now);
    expect(r.map((x) => x.slug)).toEqual(["캠핑-덕후방", "주식"]);
    expect(r[0]!.since.getTime()).toBe(now - 5000);
    expect(r[1]!.since.getTime()).toBe(now - FIRST_LOOK_MS); // 미래 시각은 무시
    expect(parseRingQuery(new URLSearchParams({ slugs: Array.from({ length: 50 }, (_, i) => `r${i}`).join(",") })).length).toBe(30);
  });
  it("색 동그라미 방 먼저, 그 안에서는 원래 순서", () => {
    const list = [{ slug: "a" }, { slug: "b" }, { slug: "c" }, { slug: "d" }];
    const rings = { a: { quiz: false, fresh: false }, b: { quiz: true, fresh: false }, d: { quiz: false, fresh: true } };
    expect(ringOrder(list, rings).map((x) => x.slug)).toEqual(["b", "d", "a", "c"]);
    expect(ringOrder(list, null)).toBe(list);
    expect([ringOn(rings.a), ringOn(rings.b), ringOn(undefined)]).toEqual([false, true, false]);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("⭕ 내 방 동그라미 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const qz = await import("@/lib/repo/roomQuizzes");
  const { newPostCounts } = await import("@/lib/repo/categories");
  const { QUIZ_EXCLUDED } = await import("@/lib/roomQuizzes");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("안 한 방은 색, 답하면 회색, 제외 방은 늘 회색 (쿼리 하나로)", async () => {
    const day = "2026-10-29";
    const ex = [...QUIZ_EXCLUDED][0]!;
    const rooms = ["캠핑-덕후방", ex, "퀴즈없는방"];
    const p = await qz.quizPending(rooms, day, "v1");
    expect(p["캠핑-덕후방"]).toBe(true);
    for (const r of QUIZ_EXCLUDED) expect((await qz.quizPending([r], day, "v1"))[r], r).toBe(false);
    // 방 안 퀴즈 카드(todayQuiz)와 같은 판단
    for (const r of rooms) expect(p[r], r).toBe((await qz.todayQuiz(r, day)) !== null);
    // 쿠키가 없어도 오늘 퀴즈가 있으면 색
    expect((await qz.quizPending(rooms, day, null))["캠핑-덕후방"]).toBe(true);
    await qz.answerQuiz("캠핑-덕후방", day, "v1", { choice: 0 });
    expect((await qz.quizPending(rooms, day, "v1"))["캠핑-덕후방"]).toBe(false);
    expect((await qz.quizPending(rooms, day, "v2"))["캠핑-덕후방"]).toBe(true);
    // 운영자가 넣은 퀴즈 날
    await query("INSERT INTO room_quizzes (room, day, kind, payload) VALUES ('퀴즈없는방', $1, 'pick', '{\"q\":\"?\",\"options\":[\"a\",\"b\"]}')", [day]);
    expect((await qz.quizPending(["퀴즈없는방"], day, "v1"))["퀴즈없는방"]).toBe(true);
    // 💌 미혼남녀방: 오늘의 질문 투표(노트)로 답한 것
    expect((await qz.quizPending(["미혼남녀-만남-행사"], day, "v1"))["미혼남녀-만남-행사"]).toBe(true);
    await query("INSERT INTO quiz_notes (visitor_hash, room, day, kind, question, answer_text) VALUES ('v1', '미혼남녀-만남-행사', $1, 'poll', '질문', 'A')", [day]);
    expect((await qz.quizPending(["미혼남녀-만남-행사"], day, "v1"))["미혼남녀-만남-행사"]).toBe(false);
  });

  it("본 뒤 새 글·채팅이 있으면 fresh", async () => {
    const [c] = await query<{ id: number; slug: string }>("SELECT id, slug FROM categories ORDER BY id LIMIT 1");
    const seen = new Date(Date.now() - 3600_000);
    expect(await newPostCounts([{ slug: c!.slug, since: seen }])).toEqual({});
    await query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, '사람', 'x', '채팅', '안녕', 'chat')", [c!.id]);
    expect((await newPostCounts([{ slug: c!.slug, since: seen }]))[c!.slug]).toBe(1);
    expect(await newPostCounts([{ slug: c!.slug, since: new Date(Date.now() + 1000) }])).toEqual({});
  });
});
