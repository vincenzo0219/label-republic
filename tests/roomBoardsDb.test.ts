import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🧩 놀이판 2단계 (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const repo = await import("@/lib/repo/roomBoards");
  const { imageToken, sweepOrphanImages } = await import("@/lib/repo/images");
  const { badgesFor } = await import("@/lib/repo/badges");
  const { recordPlay } = await import("@/lib/repo/miniGames");
  const rb = await import("@/lib/roomBoards");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  const kst = (s: string) => new Date(`${s}+09:00`);

  it("📒 log: one row per period, week total, average from 3, top % from 5, streak", async () => {
    const mon = kst("2026-11-02T08:00:00");
    const tue = kst("2026-11-03T08:00:00");
    let c = await repo.addLog("run-km", "v1", { value: 5, nickname: "달리미" }, mon);
    expect(c).toMatchObject({ people: 1, total: 5, avg: null, topPct: null, streak: 1, window: "이번 주" });
    c = await repo.addLog("run-km", "v1", { value: 7.5 }, mon); // 같은 날은 고친다
    expect(c).toMatchObject({ total: 7.5, today: [{ label: "", value: 7.5 }] });
    c = await repo.addLog("run-km", "v1", { value: 3 }, tue);
    expect(c).toMatchObject({ total: 10.5, streak: 2, myTotal: 10.5 });
    await repo.addLog("run-km", "v2", { value: 20 }, tue);
    c = await repo.addLog("run-km", "v3", { value: 1 }, tue);
    expect(c.avg).toBe(10.5); // (10.5+20+1)/3
    expect(c.topPct).toBeNull();
    await repo.addLog("run-km", "v4", { value: 2 }, tue);
    await repo.addLog("run-km", "v5", { value: 4, nickname: "새벽" }, tue);
    c = await repo.logCard("run-km", "v1", tue);
    expect(c).toMatchObject({ people: 5, topPct: 40 });
    expect(c.top.map((t) => t.name)).toEqual(["달리미", "새벽"]);
    // 다음 주 월요일이면 초기화
    const next = await repo.logCard("run-km", "v1", kst("2026-11-09T08:00:00"));
    expect(next).toMatchObject({ people: 0, total: 0, streak: 0 });
    // 지우기
    c = await repo.removeLog("run-km", "v3", "", tue);
    expect(c.people).toBe(4);
    await expect(repo.addLog("run-km", "v1", { value: 500 }, tue)).rejects.toMatchObject({ status: 400 });
  });

  it("📒 chips / select / text / monthly check", async () => {
    const day = kst("2026-11-04T09:00:00");
    await repo.addLog("coffee-cups", "a", { label: "라떼", value: 2 }, day);
    await repo.addLog("coffee-cups", "a", { label: "아메리카노", value: 1 }, day);
    let c = await repo.addLog("coffee-cups", "b", { label: "라떼", value: 1 }, day);
    expect(c.total).toBe(4);
    expect(c.labels[0]).toMatchObject({ label: "라떼", people: 2, total: 3 });
    await expect(repo.addLog("coffee-cups", "a", { label: "핸드드립", value: 5 }, day)).resolves.toBeTruthy();
    await expect(repo.addLog("coffee-cups", "a", { label: "디카페인", value: 5 }, day)).rejects.toMatchObject({ status: 400 }); // 하루 10잔
    for (const r of ["강원", "경기", "제주", "전남", "경북"]) await repo.addLog("camping-region", "a", { label: r }, day);
    await expect(repo.addLog("camping-region", "a", { label: "서울" }, day)).rejects.toMatchObject({ status: 400 });
    c = await repo.addLog("camping-region", "a", { label: "강원" }, day); // 같은 지역은 다시 넣어도 된다
    c = await repo.addLog("camping-region", "b", { label: "강원" }, day);
    expect(c.labels[0]).toMatchObject({ label: "강원", people: 2 });
    c = await repo.addLog("stage-seen", "a", { label: "레미제라블" }, day);
    await repo.addLog("stage-seen", "b", { label: " 레미제라블 " }, day);
    c = await repo.logCard("stage-seen", "c", day);
    expect(c.labels).toEqual([{ label: "레미제라블", people: 2, total: 2 }]);
    await expect(repo.addLog("stage-seen", "a", { label: "open.kakao.com/x" }, day)).rejects.toMatchObject({ status: 400 });
    // 💰 이번 달 적립 완료율: 최근 석 달 참여자 5명부터
    const oct = kst("2026-10-10T09:00:00");
    for (const v of ["s1", "s2", "s3", "s4", "s5"]) await repo.addLog("savings-done", v, {}, oct);
    await repo.addLog("savings-done", "s1", {}, day);
    c = await repo.addLog("savings-done", "s2", {}, day);
    expect(c.rate).toEqual({ done: 2, base: 5, pct: 40 });
    expect(c.streak).toBe(2);
    expect(c.avg).toBeNull();
  });

  it("📸 photo: one per week, hearts toggle, reports hide at 2, winner badge next week, files stay attached", async () => {
    const fri = kst("2026-11-06T22:00:00");
    const img = async () => {
      const id = randomUUID();
      await query(
        "INSERT INTO post_images (id, width, height, bytes, thumb_width, thumb_height, sha256, created_at) VALUES ($1, 10, 10, 10, 10, 10, $2, now() - interval '3 days')",
        [id, "0".repeat(64)],
      );
      return { id, token: imageToken(id) };
    };
    const i1 = await img();
    let c = await repo.addPhoto("cat-photo", "p1", { image: i1, nickname: "집사왕" }, fri);
    expect(c.photos).toHaveLength(1);
    expect(c.mine).toBeTruthy();
    await expect(repo.addPhoto("cat-photo", "p1", { image: await img() }, fri)).rejects.toMatchObject({ status: 409 });
    await expect(repo.addPhoto("cat-photo", "p2", { image: { id: i1.id, token: "x" } }, fri)).rejects.toMatchObject({ status: 400 });
    // 이미 붙은 사진은 다른 사람이 못 쓴다
    await expect(repo.addPhoto("cat-photo", "p2", { image: i1 }, fri)).rejects.toMatchObject({ status: 400 });
    c = await repo.addPhoto("cat-photo", "p2", { image: await img(), nickname: "냥냥" }, fri);
    const [first, second] = [c.photos.find((p) => p.nickname === "집사왕")!, c.photos.find((p) => p.nickname === "냥냥")!];
    await expect(repo.heartPhoto("cat-photo", first.id, "p1", fri)).rejects.toMatchObject({ status: 403 });
    await repo.heartPhoto("cat-photo", first.id, "h1", fri);
    c = await repo.heartPhoto("cat-photo", first.id, "h2", fri);
    expect(c.photos[0]).toMatchObject({ nickname: "집사왕", hearts: 2 });
    c = await repo.heartPhoto("cat-photo", first.id, "h2", fri); // 다시 누르면 취소
    expect(c.photos.find((p) => p.id === first.id)!.hearts).toBe(1);
    await repo.heartPhoto("cat-photo", second.id, "h1", fri);
    // 신고 2번이면 가린다 (올린 사람에게만 보임)
    await repo.reportItem("photo", second.id, "r1");
    await repo.reportItem("photo", second.id, "r1"); // 같은 사람은 한 번
    expect((await repo.photoCard("cat-photo", "x", fri)).photos).toHaveLength(2);
    expect(await repo.reportItem("photo", second.id, "r2")).toEqual({ hidden: true });
    expect((await repo.photoCard("cat-photo", "x", fri)).photos).toHaveLength(1);
    expect((await repo.photoCard("cat-photo", "p2", fri)).photos.find((p) => p.mine)!.hidden).toBe(true);
    await expect(repo.reportItem("photo", first.id, "p1")).rejects.toMatchObject({ status: 403 });
    // 다음 주: 지난주 1등 + 배지
    const nextWeek = new Date(fri.getTime() + 7 * 86_400_000);
    const n = await repo.photoCard("cat-photo", "x", nextWeek);
    expect(n.photos).toHaveLength(0);
    expect(n.lastWinner).toMatchObject({ nickname: "집사왕", hearts: 1 });
    await expect(repo.heartPhoto("cat-photo", first.id, "h3", nextWeek)).rejects.toMatchObject({ status: 409 });
    expect(await repo.photoWinnerBadges(["집사왕", "냥냥"], nextWeek)).toEqual({ 집사왕: rb.WINNER_BADGE });
    // 붙은 사진은 고아 정리에서 지우지 않는다 (지워지는 건 409 로 거절된 업로드 한 장뿐)
    expect(await sweepOrphanImages()).toBe(1);
    expect((await query("SELECT 1 FROM post_images WHERE room_photo_id IS NOT NULL")).length).toBe(2);
    // 지우기
    c = await repo.deletePhoto("cat-photo", first.id, "p1", fri);
    expect(c.mine).toBeNull();
    // badgesFor 합치기 (진짜 시계 기준이라 지난주 1등을 지금 주에 맞춰 넣는다)
    await query("INSERT INTO room_photos (board, week, visitor_hash, nickname, image_id, hearts) VALUES ('viv-photo', $1::date, 'w', '장인', $2, 3)", [rb.prevPhotoWeek(), randomUUID()]);
    expect((await badgesFor("비바리움-덕후방", ["장인", "없는사람"]))["장인"]).toContain("🏆 이번 주 1등");
  });

  it("🤔 vote: 48h, results after voting, own item blocked, change vote, reports hide, daily limit", async () => {
    let c = await repo.createVote("shoe-vote", "o1", { title: "조던 1 하이", price: 219000, nickname: "신발러", fingerprint: "f1" });
    const it = c.open[0]!;
    expect(it).toMatchObject({ title: "조던 1 하이", price: 219000, owner: true, tally: { yes: 0, no: 0 } });
    expect(Date.parse(it.closes_at) - Date.now()).toBeGreaterThan(47 * 3600_000);
    c = await repo.voteCard("shoe-vote", "x1");
    expect(c.open[0]!.tally).toBeNull();
    await expect(repo.castVote("shoe-vote", it.id, "o1", true)).rejects.toMatchObject({ status: 403 });
    c = await repo.castVote("shoe-vote", it.id, "x1", true);
    expect(c.open[0]).toMatchObject({ mine: true, tally: { yes: 1, no: 0 } });
    c = await repo.castVote("shoe-vote", it.id, "x1", false);
    expect(c.open[0]!.tally).toEqual({ yes: 0, no: 1 });
    // 다른 판과 섞이지 않는다
    expect((await repo.voteCard("shop-vote", "x1")).open).toHaveLength(0);
    await expect(repo.castVote("shop-vote", it.id, "x1", true)).rejects.toMatchObject({ status: 404 });
    await expect(repo.createVote("shoe-vote", "o1", { title: "카톡 주세요 신발" })).rejects.toMatchObject({ status: 400 });
    await expect(repo.createVote("shoe-vote", "o1", { title: "a" })).rejects.toMatchObject({ status: 400 });
    await repo.createVote("shoe-vote", "o1", { title: "뉴발란스 993", fingerprint: "f1" });
    await repo.createVote("shoe-vote", "o1", { title: "아식스 젤", fingerprint: "f1" });
    await expect(repo.createVote("shoe-vote", "o1", { title: "하나 더", fingerprint: "f1" })).rejects.toMatchObject({ status: 429 });
    // 마감
    await query("UPDATE room_votes SET closes_at = now() - interval '1 minute' WHERE id = $1", [it.id]);
    c = await repo.voteCard("shoe-vote", "stranger");
    expect(c.closed[0]).toMatchObject({ id: it.id, closed: true, tally: { yes: 0, no: 1 } });
    await expect(repo.castVote("shoe-vote", it.id, "x2", true)).rejects.toMatchObject({ status: 409 });
    await repo.reportItem("vote", it.id, "r1");
    await repo.reportItem("vote", it.id, "r2");
    expect((await repo.voteCard("shoe-vote", "stranger")).closed).toHaveLength(0);
    await expect(repo.deleteVote("shoe-vote", it.id, "x1")).rejects.toMatchObject({ status: 404 });
  });

  it("🌱 quiz once a day with server grading and streak, 🍷 weekly vote can change", async () => {
    const d1 = kst("2026-11-02T09:00:00");
    const d2 = kst("2026-11-03T09:00:00");
    let c = await repo.pickCard("vegan-quiz", "q1", d1);
    expect(c).toMatchObject({ mode: "quiz", question: rb.ingredientOfDay("2026-11-02").name, result: null });
    const right = rb.quizAnswer("2026-11-02");
    c = await repo.pick("vegan-quiz", "q1", right, d1);
    expect(c.mode === "quiz" && c.result).toMatchObject({ correct: true, answer: right });
    c = await repo.pick("vegan-quiz", "q1", right === "동물성" ? "동물성 아님" : "동물성", d1); // 바꿀 수 없다
    expect(c.mode === "quiz" && c.result?.correct).toBe(true);
    for (const v of ["q2", "q3", "q4"]) await repo.pick("vegan-quiz", v, right, d1);
    c = await repo.pickCard("vegan-quiz", "q1", d1);
    expect(c.mode === "quiz" && c.correctPct).toBeNull(); // 5명부터
    await repo.pick("vegan-quiz", "q5", right === "동물성" ? "동물성 아님" : "동물성", d1);
    c = await repo.pickCard("vegan-quiz", "q1", d1);
    expect(c.mode === "quiz" && c.correctPct).toBe(80);
    c = await repo.pick("vegan-quiz", "q1", rb.quizAnswer("2026-11-03"), d2);
    expect(c).toMatchObject({ streak: 2, wins: 2 });
    await expect(repo.pick("vegan-quiz", "q1", "몰라요", d2)).rejects.toMatchObject({ status: 400 });

    const w = kst("2026-11-04T20:00:00");
    await repo.pick("wine-note", "w1", "체리", w);
    await repo.pick("wine-note", "w2", "체리", w);
    let v = await repo.pick("wine-note", "w1", "바닐라", w);
    expect(v).toMatchObject({ mode: "vote", total: 2, mine: "바닐라" });
    expect(v.mode === "vote" && [v.counts["체리"], v.counts["바닐라"]]).toEqual([1, 1]);
    v = await repo.pickCard("wine-note", "w1", kst("2026-11-09T20:00:00"));
    expect(v).toMatchObject({ total: 0, mine: null });
  });

  it("⭐ ratings: one score per title per person, averages from 3, quarters reset; 🔐 success rate", async () => {
    const t = kst("2026-11-04T09:00:00");
    await repo.rate("anime-stars", "a1", { label: "신작 A", score: 5 }, t);
    await repo.rate("anime-stars", "a2", { label: "신작 A", score: 4 }, t);
    let c = await repo.rate("anime-stars", "a1", { label: "신작 A", score: 3 }, t); // 고친다
    expect(c).toMatchObject({ shown: [], waiting: [{ label: "신작 A", n: 2, sum: 7, mine: 3 }] });
    c = await repo.rate("anime-stars", "a3", { label: "신작 A", score: 5 }, t);
    expect(c.shown[0]).toMatchObject({ label: "신작 A", n: 3, avg: 4 });
    await expect(repo.rate("anime-stars", "a3", { label: "신작 B", score: 6 }, t)).rejects.toMatchObject({ status: 400 });
    expect((await repo.ratingCard("anime-stars", "a1", kst("2027-01-02T09:00:00"))).shown).toHaveLength(0);
    c = await repo.unrate("anime-stars", "a3", "신작 A", t);
    expect(c.shown).toHaveLength(0);
    for (const [v, s] of [["e1", 1], ["e2", 0], ["e3", 1], ["e4", 1]] as const) c = await repo.rate("escape-log", v, { label: "링 테마", score: s }, t);
    expect(c.shown[0]).toMatchObject({ label: "링 테마", n: 4, avg: 0.75 });
    await expect(repo.rate("escape-log", "e1", { label: "링 테마", score: 3 }, t)).rejects.toMatchObject({ status: 400 });
  });

  it("🐶 pets: month/day only, 3 per person, today's cheers once a day, reports hide", async () => {
    const today = kst("2026-11-02T10:00:00");
    let c = await repo.addPet("dog-days", "d1", { name: "콩이", kind: "birthday", month: 11, day: 2, nickname: "콩엄마" }, today);
    expect(c.today).toHaveLength(1);
    expect(c.today[0]).toMatchObject({ pet_name: "콩이", nickname: "콩엄마", cheers: 0, mine: true });
    await repo.addPet("dog-days", "d1", { name: "보리", kind: "adopted", month: 11, day: 20 }, today);
    await repo.addPet("dog-days", "d1", { name: "밤이", kind: "birthday", month: 3, day: 1 }, today);
    await expect(repo.addPet("dog-days", "d1", { name: "넷째", kind: "birthday", month: 1, day: 1 }, today)).rejects.toMatchObject({ status: 400 });
    await expect(repo.addPet("dog-days", "d2", { name: "가".repeat(11), kind: "birthday", month: 1, day: 1 }, today)).rejects.toMatchObject({ status: 400 });
    await expect(repo.addPet("dog-days", "d2", { name: "초코", kind: "birthday", month: 2, day: 30 }, today)).rejects.toMatchObject({ status: 400 });
    c = await repo.petCard("dog-days", "d2", today);
    expect(c.month.map((p) => p.pet_name)).toEqual(["보리"]);
    expect(c.total).toBe(3);
    const id = c.today[0]!.id;
    await repo.cheerPet("dog-days", id, "d2", today);
    c = await repo.cheerPet("dog-days", id, "d2", today);
    expect(c.today[0]).toMatchObject({ cheers: 1, cheered: true });
    await expect(repo.cheerPet("dog-days", c.month[0]!.id, "d2", today)).rejects.toMatchObject({ status: 409 });
    expect((await repo.petCard("dog-days", "d2", kst("2026-11-03T10:00:00"))).today).toHaveLength(0);
    await repo.reportItem("pet", id, "r1");
    await repo.reportItem("pet", id, "r2");
    expect((await repo.petCard("dog-days", "d2", today)).today).toHaveLength(0);
    c = await repo.deletePet("dog-days", c.month[0]!.id, "d1", today);
    expect(c.mine.map((p) => p.pet_name)).toEqual(["밤이"]);
  });

  it("🙋 this week's [행사] posts, 🎾 rally week ranking", async () => {
    await query("INSERT INTO categories (slug, name) VALUES ('팝업-전시-덕후방', '팝업·전시 덕후방') ON CONFLICT (slug) DO NOTHING");
    const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = '팝업-전시-덕후방'");
    const md = (days: number) => {
      const k = new Date(Date.now() + 9 * 3600_000 + days * 86_400_000);
      return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
    };
    for (const [title, body] of [
      [`[행사] 캐릭터 팝업 · ${md(3)} 성수`, "팝업 소개"],
      [`[행사] 먼 전시 · ${md(20)} 종로`, "나중"],
      [`[혜택] 할인 · ${md(2)}`, "할인"],
    ]) await query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, '운영', 'x', $2, $3, 'chat')", [cat!.id, title, body]);
    const ev = await repo.weekEvents("팝업-전시-덕후방");
    expect(ev.map((e) => e.name)).toEqual(["캐릭터 팝업"]);
    expect(ev[0]!.dday).toBe(3);
    expect(await repo.weekEvents("없는-방")).toEqual([]);

    await recordPlay("rally", "r1", 30, new Date(), "랠리왕");
    await recordPlay("rally", "r1", 12, new Date());
    await recordPlay("rally", "r2", 45, new Date());
    await query("INSERT INTO game_plays (game, room, visitor_hash, score, day) VALUES ('rally', '테니스-덕후방', 'old', 300, '2020-01-06')");
    const rows = await repo.rallyWeekRank("r1");
    expect(rows.map((r) => [r.score, r.me])).toEqual([[45, false], [30, true]]);
    expect(rows[1]!.name).toBe("랠리왕");
    expect(rows[0]!.name).toMatch(/^손님 /);
  });

  it("generic card dispatch", async () => {
    expect((await repo.boardCard("yoga-mat", null)).kind).toBe("log");
    await expect(repo.boardCard("nope", null)).rejects.toMatchObject({ status: 404 });
    await expect(repo.logCard("shoe-vote", null)).rejects.toMatchObject({ status: 404 });
  });
});
