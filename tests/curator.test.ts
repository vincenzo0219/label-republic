import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { curatorIntervalHours, seedFileSchema, type SeedPost } from "@/lib/curator";
import { heuristicSpam } from "@/lib/moderation";

describe("curator retreat policy", () => {
  it("posts twice a day when there are almost no human posts", () => {
    expect(curatorIntervalHours({ humanPosts7d: 0, aiPosts7d: 0 })).toBe(12);
    expect(curatorIntervalHours({ humanPosts7d: 2, aiPosts7d: 14 })).toBe(12);
  });
  it("backs off as human posts grow", () => {
    expect(curatorIntervalHours({ humanPosts7d: 3, aiPosts7d: 10 })).toBe(24);
    expect(curatorIntervalHours({ humanPosts7d: 7, aiPosts7d: 7 })).toBe(48);
  });
  it("stops when humans carry the board", () => {
    expect(curatorIntervalHours({ humanPosts7d: 20, aiPosts7d: 0 })).toBeNull();
    expect(curatorIntervalHours({ humanPosts7d: 12, aiPosts7d: 3 })).toBeNull(); // 80%
    expect(curatorIntervalHours({ humanPosts7d: 12, aiPosts7d: 7 })).toBe(48); // 63%
  });
});

describe("shipped seed content", () => {
  const dir = path.join(process.cwd(), "db", "seed", "curator");
  const seeds: SeedPost[] = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => seedFileSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))));

  it("covers the five launch boards with 5–7 posts each (25–35 total)", () => {
    const byBoard = new Map<string, number>();
    for (const s of seeds) byBoard.set(s.category, (byBoard.get(s.category) ?? 0) + 1);
    expect([...byBoard.keys()].sort()).toEqual(["deskterior", "keyboards", "perfume-audio", "pet-food", "supplements"]);
    for (const n of byBoard.values()) expect(n).toBeGreaterThanOrEqual(5), expect(n).toBeLessThanOrEqual(7);
    expect(seeds.length).toBeGreaterThanOrEqual(25);
    expect(seeds.length).toBeLessThanOrEqual(35);
  });

  it("has unique keys and 2–3 comments on launch posts", () => {
    expect(new Set(seeds.map((s) => s.key)).size).toBe(seeds.length);
    for (const s of seeds.filter((x) => x.phase === "launch")) {
      expect(s.comments.length).toBeGreaterThanOrEqual(2);
      expect(s.comments.length).toBeLessThanOrEqual(3);
    }
  });

  it("avoids definitive efficacy claims and never trips the spam filter", () => {
    const forbidden = /완치|특효|치료\s*효과|예방\s*효과|효능\s*보장|무조건\s*좋/;
    for (const s of seeds) {
      const text = [s.title, s.body, ...s.summary, ...s.comments].join("\n");
      expect(text, s.key).not.toMatch(forbidden);
      expect(heuristicSpam(s.title, s.body).score, s.key).toBe(0);
    }
  });
});
