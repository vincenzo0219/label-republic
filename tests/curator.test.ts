import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { curatorIntervalHours, seedFileSchema, type SeedPost } from "@/lib/curator";
import { curatorSafetyProblems, FORBIDDEN_CLAIMS, type CuratorDraft } from "@/lib/curator-ai";
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

  const info = seeds.filter((s) => s.postType === "info");
  const chat = seeds.filter((s) => s.postType === "chat");

  it("covers the five launch boards with 5–7 info posts each (25–35 total)", () => {
    const byBoard = new Map<string, number>();
    for (const s of info) byBoard.set(s.category, (byBoard.get(s.category) ?? 0) + 1);
    expect([...byBoard.keys()].sort()).toEqual(["deskterior", "keyboards", "perfume-audio", "pet-food", "supplements"]);
    for (const n of byBoard.values()) expect(n).toBeGreaterThanOrEqual(5), expect(n).toBeLessThanOrEqual(7);
    expect(info.length).toBeGreaterThanOrEqual(25);
    expect(info.length).toBeLessThanOrEqual(35);
  });

  it("has two conversation starters per launch board, one published at launch (Sprint 45)", () => {
    const byBoard = new Map<string, string[]>();
    for (const s of chat) byBoard.set(s.category, [...(byBoard.get(s.category) ?? []), s.phase]);
    expect([...byBoard.keys()].sort()).toEqual(["deskterior", "keyboards", "perfume-audio", "pet-food", "supplements"]);
    for (const phases of byBoard.values()) expect(phases.sort()).toEqual(["drip", "launch"]);
  });

  it("has unique keys, 2–3 comments on launch info posts and none on conversation starters", () => {
    expect(new Set(seeds.map((s) => s.key)).size).toBe(seeds.length);
    for (const s of info.filter((x) => x.phase === "launch")) {
      expect(s.comments.length).toBeGreaterThanOrEqual(2);
      expect(s.comments.length).toBeLessThanOrEqual(3);
    }
    for (const s of chat) expect(s.comments, s.key).toEqual([]);
  });

  it("avoids definitive efficacy claims and never trips the spam filter", () => {
    for (const s of seeds) {
      const text = [s.title, s.body, ...s.summary, ...s.comments].join("\n");
      expect(text, s.key).not.toMatch(FORBIDDEN_CLAIMS);
      expect(heuristicSpam(s.title, s.body).score, s.key).toBe(0);
    }
  });

  it("passes the same safety check as AI-written posts, so all of it can go out without human review (Sprint 37)", () => {
    for (const s of seeds) {
      expect(curatorSafetyProblems({ title: s.title, body: s.body, summary: s.summary, comments: s.comments, kind: s.postType }), s.key).toEqual([]);
    }
  });
});

describe("safety check for AI posts published without human review (Sprint 37)", () => {
  const ok: CuratorDraft = {
    title: "기계식 키보드 스위치 스펙표 읽는 법",
    body:
      "스위치 스펙표에는 작동압, 바닥압, 작동 거리 같은 값이 적혀 있습니다. 제조사 스펙 기준으로 작동압이 45gf 라고 적혀 있어도 측정 방법에 따라 조금씩 다를 수 있습니다. ".repeat(4) +
      "\n확인 체크리스트\n- 제조사 스펙 시트의 측정 기준을 확인합니다.\n- 같은 이름이라도 생산 시기를 확인합니다.",
    summary: ["스펙표의 작동압은 제조사 측정 기준 값입니다.", "측정 방법에 따라 값이 다를 수 있습니다.", "생산 시기에 따라 스펙이 바뀌기도 합니다."],
    comments: ["Q. 작동압과 바닥압 차이는? / A. 누르기 시작할 때와 끝까지 눌렀을 때의 힘입니다."],
  };
  it("accepts a factual post with sources and a checklist", () => {
    expect(curatorSafetyProblems(ok)).toEqual([]);
  });
  it("rejects efficacy claims, links, unsourced numbers, missing checklists and repeated titles", () => {
    expect(curatorSafetyProblems({ ...ok, body: ok.body + " 이 제품은 불면증을 완치합니다." })[0]).toContain("단정적 효능 표현");
    expect(curatorSafetyProblems({ ...ok, summary: ["부작용이 전혀 없습니다", "둘", "셋"] })[0]).toContain("단정적 효능 표현");
    expect(curatorSafetyProblems({ ...ok, body: ok.body + " https://shop.example.com" })).toContain("링크·연락처");
    const unsourced = { title: "마그네슘 하루 섭취량", body: "마그네슘은 하루 350mg 이면 충분합니다. ".repeat(20) + "\n확인 체크리스트\n- 확인", summary: ["하루 섭취량 정리", "둘째 줄", "셋째 줄"] as CuratorDraft["summary"], comments: [] };
    expect(curatorSafetyProblems(unsourced)).toContain("수치의 근거(라벨·제조사 표기·스펙)를 밝히지 않음");
    expect(curatorSafetyProblems({ ...ok, body: ok.body.replace("확인 체크리스트", "정리") })).toContain("확인 체크리스트 없음");
    expect(curatorSafetyProblems(ok, ["기계식 키보드 스위치 스펙표 읽는 법!"])).toContain("최근 글과 같은 제목");
    expect(curatorSafetyProblems({ ...ok, body: "짧은 글. 확인 체크리스트" })).toContain("본문 길이 14자");
  });
});
