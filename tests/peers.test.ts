import { describe, expect, it } from "vitest";
import { findPeer, teamOf, typeLabel, typeOf } from "@/lib/peers";

describe("test result peers (Sprint 94)", () => {
  it("reads the team people wrote, in their own spelling", () => {
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: Fc서울")).toBe("FC서울");
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원삼성블루윙즈/수원직관러")).toBe("수원삼성");
    expect(teamOf("⚽ 축구 팬 테스트: 📊 전술 분석가 / 응원 팀: 수원FC")).toBe("수원FC");
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 울산 HD FC")).toBe("울산");
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: -")).toBeUndefined();
    expect(teamOf("🎧 황금귀 테스트 7/10 (👂 예민한 귀) / 장비: 해드폰")).toBeUndefined();
  });

  it("reads the type or score before the first slash", () => {
    expect(typeOf("🎧 황금귀 테스트 7/10 (👂 예민한 귀) / 장비: 해드폰")).toBe("🎧 황금귀 테스트 7/10 (👂 예민한 귀)");
    expect(typeLabel("⚽ 축구 팬 테스트: 🚌 원정 직관러")).toBe("🚌 원정 직관러");
    expect(typeOf("그냥 인사해요")).toBeUndefined();
  });

  it("prefers the same team, then the same type, never oneself", () => {
    const earlier = [
      { nickname: "인유", body: "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: ㄱㅎ" },
      { nickname: "1983", body: "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: FC서울" },
    ];
    expect(findPeer("⚽ 축구 팬 테스트: 📊 전술 분석가 / 응원 팀: FC 서울", "ynk", earlier)).toEqual({ nickname: "1983", why: "team", label: "FC서울" });
    expect(findPeer("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 강원FC", "또타", earlier)).toEqual({ nickname: "인유", why: "type", label: "🚌 원정 직관러" });
    expect(findPeer("⚽ 축구 팬 테스트: 🛋 소파 응원단 / 응원 팀: 제주", "x", earlier)).toBeNull();
    expect(findPeer("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: FC서울", "1983", earlier.slice(1))).toBeNull();
  });
});

describe("KBO teams (10/21)", async () => {
  const { teamOf } = await import("@/lib/peers");
  const { baseballPick, baseballBragLine, BASEBALL_TYPES } = await import("@/lib/baseballTest");
  it("reads KBO clubs after 응원 구단: without mixing in K League names", () => {
    expect(teamOf(`${baseballBragLine(BASEBALL_TYPES.cheer!)}기아 타이거즈`)).toBe("KIA");
    expect(teamOf("⚾ 야구 팬 테스트: 🍗 야구장 먹방러 / 응원 구단: 대구 삼성")).toBe("삼성");
    expect(teamOf("⚾ 야구 팬 테스트: 📊 기록 분석가 / 응원 구단: kt wiz 수원")).toBe("KT");
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 대구fc")).toBe("대구");
  });
  it("picks a type from the four answers", () => {
    expect(baseballPick({ stadium: true, cheer: true, analysis: false, goods: false }).key).toBe("cheer");
    expect(baseballPick({ stadium: true, cheer: false, analysis: true, goods: true }).key).toBe("food");
    expect(baseballPick({ stadium: false, cheer: false, analysis: true, goods: false }).key).toBe("analyst");
    expect(baseballPick({ stadium: false, cheer: false, analysis: false, goods: true }).key).toBe("collector");
    expect(baseballPick({ stadium: false, cheer: true, analysis: false, goods: false }).key).toBe("home");
  });
});

describe("runner test (10/21)", async () => {
  const { runnerPick } = await import("@/lib/runnerTest");
  it("picks a type from the four answers", () => {
    expect(runnerPick({ dawn: true, crew: false, record: true, race: true }).key).toBe("record");
    expect(runnerPick({ dawn: true, crew: true, record: false, race: true }).key).toBe("medal");
    expect(runnerPick({ dawn: true, crew: true, record: false, race: false }).key).toBe("crew");
    expect(runnerPick({ dawn: true, crew: false, record: false, race: false }).key).toBe("dawn");
    expect(runnerPick({ dawn: false, crew: false, record: false, race: false }).key).toBe("scenery");
  });
});

describe("yoga test (10/21)", async () => {
  const { yogaPick } = await import("@/lib/yogaTest");
  it("picks a type from the four answers", () => {
    expect(yogaPick({ sweat: true, group: true, morning: true, gear: true }).key).toBe("core");
    expect(yogaPick({ sweat: false, group: true, morning: false, gear: false }).key).toBe("mate");
    expect(yogaPick({ sweat: false, group: true, morning: false, gear: true }).key).toBe("gear");
    expect(yogaPick({ sweat: false, group: false, morning: true, gear: true }).key).toBe("morning");
    expect(yogaPick({ sweat: false, group: false, morning: false, gear: false }).key).toBe("heal");
  });
});

describe("shoe test (10/23)", async () => {
  const { shoePick } = await import("@/lib/shoeTest");
  const base = { halfUp: false, sneaker: true, wearOut: true, comfy: true, draw: false, box: false, clean: false };
  it("picks a type from the seven answers", () => {
    expect(shoePick(base).key).toBe("comfort");
    expect(shoePick({ ...base, draw: true, wearOut: false }).key).toBe("hunter");
    expect(shoePick({ ...base, box: true, clean: true }).key).toBe("collector");
    expect(shoePick({ ...base, sneaker: false, comfy: false, wearOut: false }).key).toBe("coordi");
    expect(shoePick({ ...base, halfUp: true }).key).toBe("comfort");
  });
});

describe("game test (10/23)", async () => {
  const { gamePick, gameBragLine, GAME_TYPES } = await import("@/lib/gameTest");
  const { typeOf, typeLabel } = await import("@/lib/peers");
  const base = { rank: false, story: false, night: false, friends: false, voice: false, phone: false, short: false };
  it("picks a type from the seven answers", () => {
    expect(gamePick({ ...base, rank: true }).key).toBe("rank");
    expect(gamePick({ ...base, night: true, story: true }).key).toBe("story");
    expect(gamePick({ ...base, friends: true, voice: true, story: true }).key).toBe("party");
    expect(gamePick({ ...base, phone: true, short: true, story: true, friends: true }).key).toBe("mobile");
  });
  it("brag line reads as a test result type", () => {
    expect(typeLabel(typeOf(`${gameBragLine(GAME_TYPES.rank!)}롤`)!)).toBe("🏆 랭크 올인파");
  });
});

describe("drama test (10/23)", async () => {
  const { dramaPick } = await import("@/lib/dramaTest");
  const base = { binge: false, live: false, spoil: false, quote: false, chat: false, rewatch: false, night: false };
  it("picks a type from the seven answers", () => {
    expect(dramaPick(base).key).toBe("live");
    expect(dramaPick({ ...base, binge: true, night: true }).key).toBe("binge");
    expect(dramaPick({ ...base, spoil: true }).key).toBe("ending");
    expect(dramaPick({ ...base, binge: true, quote: true, rewatch: true }).key).toBe("quote");
  });
});

describe("coffee test (10/23)", async () => {
  const { coffeePick } = await import("@/lib/coffeeTest");
  const base = { ice: false, sweet: false, beans: false, home: false, space: false, takeout: false, milk: false };
  it("picks a type from the seven answers", () => {
    expect(coffeePick(base).key).toBe("space");
    expect(coffeePick({ ...base, beans: true, home: true, takeout: true }).key).toBe("drip");
    expect(coffeePick({ ...base, ice: true, takeout: true }).key).toBe("ice");
    expect(coffeePick({ ...base, sweet: true, milk: true, takeout: true }).key).toBe("latte");
  });
});

describe("anime test (10/23)", async () => {
  const { animePick } = await import("@/lib/animeTest");
  const base = { goods: false, binge: false, manga: false, event: false, cosplay: false, next: false, shelf: false };
  it("picks a type from the seven answers", () => {
    expect(animePick(base).key).toBe("manga");
    expect(animePick({ ...base, goods: true, shelf: true }).key).toBe("goods");
    expect(animePick({ ...base, binge: true }).key).toBe("binge");
    expect(animePick({ ...base, event: true, cosplay: true }).key).toBe("event");
  });
});

describe("vivarium type test (10/23)", async () => {
  const { vivTypePick, VIV_TYPE_INTRO_POST_ID } = await import("@/lib/vivTest");
  const { TEST_POST_IDS } = await import("@/lib/testPosts");
  const base = { keeping: true, layout: false, watch: false, note: false, search: false, feed: false, plan: false };
  it("picks a type from the seven answers", () => {
    expect(vivTypePick(base).key).toBe("layout");
    expect(vivTypePick({ ...base, keeping: false }).key).toBe("newbie");
    expect(vivTypePick({ ...base, watch: true, note: true, feed: true }).key).toBe("observe");
    expect(vivTypePick({ ...base, feed: true, search: true }).key).toBe("feed");
  });
  it("posts results into a registered test post", () => {
    expect(TEST_POST_IDS.has(VIV_TYPE_INTRO_POST_ID)).toBe(true);
  });
});

describe("wine test (10/23)", async () => {
  const { winePick, wineBragLine, WINE_TYPES, WINE_INTRO_POST_ID } = await import("@/lib/wineTest");
  const { TEST_POST_IDS } = await import("@/lib/testPosts");
  const { typeOf, typeLabel } = await import("@/lib/peers");
  const base = { red: false, heavy: false, smoky: false, fruit: false, pairing: false, label: false };
  it("picks a type from the six answers", () => {
    expect(winePick({ ...base, fruit: true }).key).toBe("light");
    expect(winePick({ ...base, red: true, heavy: true, fruit: true }).key).toBe("red");
    expect(winePick({ ...base, red: true, smoky: true }).key).toBe("peat");
    expect(winePick({ ...base, red: true, heavy: true, fruit: true, pairing: true, label: true }).key).toBe("pair");
  });
  it("brag line reads as a test result type and posts into a test post", () => {
    expect(typeLabel(typeOf(`${wineBragLine(WINE_TYPES.peat!)}훈연 향`)!)).toBe("🥃 스모키 피트파");
    expect(TEST_POST_IDS.has(WINE_INTRO_POST_ID)).toBe(true);
  });
});

describe("debate style test (10/23)", async () => {
  const { debatePick, debateBragLine, DEBATE_TYPES, DEBATE_TEST_POST_ID } = await import("@/lib/debateTest");
  const { TEST_POST_IDS } = await import("@/lib/testPosts");
  const { typeOf, typeLabel } = await import("@/lib/peers");
  const base = { evidence: false, empathy: false, last: false, flip: false, calm: false, facts: false, fun: false };
  it("picks a type from the seven answers", () => {
    expect(debatePick(base).key).toBe("fighter");
    expect(debatePick({ ...base, evidence: true, facts: true }).key).toBe("logic");
    expect(debatePick({ ...base, empathy: true, calm: true, fun: true }).key).toBe("mediator");
    expect(debatePick({ ...base, flip: true, fun: true }).key).toBe("devil");
  });
  it("brag line reads as a test result type and posts into a test post", () => {
    expect(typeLabel(typeOf(`${debateBragLine(DEBATE_TYPES.logic!)}찍먹`)!)).toBe("🧠 근거 들이미는 논리파");
    expect(TEST_POST_IDS.has(DEBATE_TEST_POST_ID)).toBe(true);
  });
});

describe("parent type test (10/23)", async () => {
  const { parentPick, parentBragLine, PARENT_TYPES, PARENT_INTRO_POST_ID } = await import("@/lib/parentTest");
  const { TEST_POST_IDS } = await import("@/lib/testPosts");
  const { RANK_TESTS } = await import("@/lib/testRanks");
  const { typeOf, typeLabel } = await import("@/lib/peers");
  const base = { research: false, plan: false, photo: false, diary: false, outing: false, place: false, easy: false };
  it("picks a type from the seven answers", () => {
    expect(parentPick(base).key).toBe("easy");
    expect(parentPick({ ...base, research: true, plan: true }).key).toBe("info");
    expect(parentPick({ ...base, plan: true, photo: true, diary: true }).key).toBe("record");
    expect(parentPick({ ...base, plan: true, outing: true, place: true }).key).toBe("outing");
  });
  it("results are all positive and free of dashes", () => {
    for (const t of Object.values(PARENT_TYPES)) expect(`${t.name}${t.what}`).not.toMatch(/[—–]/);
  });
  it("brag line reads as a test result type and posts into a test post", () => {
    expect(typeLabel(typeOf(`${parentBragLine(PARENT_TYPES.outing!)}주말 나들이`)!)).toBe("🚙 나들이 대장");
    expect(TEST_POST_IDS.has(PARENT_INTRO_POST_ID)).toBe(true);
    expect(RANK_TESTS.parent?.test).toBe("/parent-test");
  });
});

describe("writer genre test (10/24)", async () => {
  const { writerPick, writerBragLine, WRITER_TYPES, WRITER_INTRO_POST_ID } = await import("@/lib/writerTest");
  const { TEST_POST_IDS } = await import("@/lib/testPosts");
  const { RANK_TESTS } = await import("@/lib/testRanks");
  const { typeOf, typeLabel } = await import("@/lib/peers");
  it("picks a genre from the five answers", () => {
    expect(writerPick({ start: "fantasy", scene: "althist", notes: "fantasy", grow: "hyunpan", comment: "world" }).key).toBe("fantasy");
    expect(writerPick({ start: "rofan", scene: "romance", notes: "althist", grow: "romance", comment: "flutter" }).key).toBe("romance");
    expect(writerPick({ start: "hyunpan", scene: "murim", notes: "murim", grow: "hyunpan", comment: "cider" }).key).toBe("hyunpan");
    expect(writerPick({ start: "rofan", scene: "murim", notes: "althist", grow: "hyunpan", comment: "world" }).key).toBe("althist");
    // 동점이면 첫 질문에서 고른 장르
    expect(writerPick({ start: "hyunpan", scene: "althist", notes: "fantasy", grow: "hyunpan", comment: "world" }).key).toBe("hyunpan");
    expect(writerPick({ start: "rofan", scene: "murim", notes: "fantasy", grow: "romance", comment: "cider" }).key).toBe("murim");
  });
  it("every genre is reachable and results are short and dash-free", () => {
    for (const t of Object.values(WRITER_TYPES)) {
      expect(`${t.name}${t.what}`).not.toMatch(/[—–]/);
      expect([...t.what].length).toBeLessThanOrEqual(40);
      expect(writerPick({ start: t.key, scene: t.key, notes: t.key, grow: t.key, comment: "world" }).key).toBe(t.key);
    }
  });
  it("brag line reads as a test result type and posts into the room chat", () => {
    expect(typeLabel(typeOf(`${writerBragLine(WRITER_TYPES.murim)}무협 10화`)!)).toBe("⚔️ 무협 고수");
    expect(TEST_POST_IDS.has(WRITER_INTRO_POST_ID)).toBe(true);
    expect(RANK_TESTS.writer?.test).toBe("/writer-test");
  });
});
