import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOM_POLLS, roomPollTopic } from "@/lib/roomPolls";
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
});
