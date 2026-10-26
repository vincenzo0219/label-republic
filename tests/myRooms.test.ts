import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roomManifest, siteManifest } from "@/lib/manifest";
import {
  addMyRoom,
  autoAddFirstRoom,
  getMyRooms,
  homeRedirectTarget,
  isSoftNav,
  MY_ROOMS_KEY,
  MY_ROOMS_MAX,
  myRoomsCookieValue,
  parseMyRoomsCookie,
  removeMyRoom,
  roomShortName,
  seedMyRooms,
  toggleMyRoom,
} from "@/lib/myRooms";

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("myRooms storage", () => {
  it("adds in order, ignores duplicates and removes", () => {
    const s = mem();
    expect(getMyRooms(s)).toEqual([]);
    expect(addMyRoom("육아-덕후방", s)).toBe(true);
    expect(addMyRoom("커피-덕후방", s)).toBe(true);
    expect(addMyRoom("육아-덕후방", s)).toBe(true);
    expect(getMyRooms(s)).toEqual(["육아-덕후방", "커피-덕후방"]);
    removeMyRoom("육아-덕후방", s);
    expect(getMyRooms(s)).toEqual(["커피-덕후방"]);
    expect(JSON.parse(s.m.get(MY_ROOMS_KEY)!)).toEqual(["커피-덕후방"]);
  });

  it("stops at 8", () => {
    const s = mem();
    for (let i = 0; i < MY_ROOMS_MAX; i++) expect(addMyRoom(`r${i}`, s)).toBe(true);
    expect(addMyRoom("r9", s)).toBe(false);
    expect(toggleMyRoom("r9", s)).toBe("full");
    expect(getMyRooms(s)).toHaveLength(8);
    expect(toggleMyRoom("r0", s)).toBe("removed");
    expect(toggleMyRoom("r9", s)).toBe("added");
    expect(getMyRooms(s).at(-1)).toBe("r9");
  });

  it("survives corrupt or odd storage and a throwing store", () => {
    expect(getMyRooms(mem({ [MY_ROOMS_KEY]: "{not json" }))).toEqual([]);
    expect(getMyRooms(mem({ [MY_ROOMS_KEY]: '{"a":1}' }))).toEqual([]);
    expect(getMyRooms(mem({ [MY_ROOMS_KEY]: JSON.stringify(["a", 3, "a", "<x>", "b", ...Array(20).fill("c")]) }))).toEqual(["a", "b", "c"]);
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(getMyRooms(bad)).toEqual([]);
    expect(() => addMyRoom("a", bad)).not.toThrow();
    expect(getMyRooms(null)).toEqual([]);
  });

  it("auto-adds only the very first room, never again (even after emptying)", () => {
    const s = mem();
    expect(autoAddFirstRoom("육아-덕후방", s)).toBe(true);
    expect(autoAddFirstRoom("커피-덕후방", s)).toBe(false);
    expect(getMyRooms(s)).toEqual(["육아-덕후방"]);
    removeMyRoom("육아-덕후방", s);
    expect(autoAddFirstRoom("커피-덕후방", s)).toBe(false);
    expect(getMyRooms(s)).toEqual([]);
    // 깨진 값은 처음으로 본다
    const c = mem({ [MY_ROOMS_KEY]: "oops" });
    expect(autoAddFirstRoom("커피-덕후방", c)).toBe(true);
    expect(getMyRooms(c)).toEqual(["커피-덕후방"]);
  });

  it("seeds once from the old last-room cookie and starred rooms", () => {
    const s = mem();
    expect(seedMyRooms(["러닝-덕후방", "커피-덕후방", "러닝-덕후방"], s)).toBe(true);
    expect(getMyRooms(s)).toEqual(["러닝-덕후방", "커피-덕후방"]);
    expect(seedMyRooms(["주식"], s)).toBe(false);
    expect(seedMyRooms([], mem())).toBe(false);
  });

  it("cookie copy round-trips; missing cookie is null", () => {
    expect(parseMyRoomsCookie(undefined)).toBeNull();
    expect(parseMyRoomsCookie("")).toEqual([]);
    expect(parseMyRoomsCookie(myRoomsCookieValue(["육아-덕후방", "주식"]))).toEqual(["육아-덕후방", "주식"]);
    expect(parseMyRoomsCookie("%E0%A4%A")).toEqual([]);
    expect(parseMyRoomsCookie(encodeURIComponent("a,'; drop,b"))).toEqual(["a", "b"]);
  });
});

describe("home redirect to the only room", () => {
  const base = { rooms: ["육아-덕후방"], search: "", referrer: "", origin: "https://nobangjang.com", softNav: false };
  it("redirects a plain outside visit with exactly one room", () => {
    expect(homeRedirectTarget(base)).toBe(`/c/${encodeURIComponent("육아-덕후방")}`);
    expect(homeRedirectTarget({ ...base, referrer: "https://l.instagram.com/" })).toBe(`/c/${encodeURIComponent("육아-덕후방")}`);
    expect(homeRedirectTarget({ ...base, search: "?source=pwa" })).toBe(`/c/${encodeURIComponent("육아-덕후방")}`);
  });
  it("tells a first screen from an in-site navigation", () => {
    expect(isSoftNav([], "/")).toBe(false);
    expect(isSoftNav(["/"], "/")).toBe(false);
    expect(isSoftNav(["/c/a"], "/")).toBe(true);
    expect(isSoftNav(["/c/a", "/"], "/")).toBe(true);
  });
  it("stays on home otherwise", () => {
    expect(homeRedirectTarget({ ...base, rooms: [] })).toBeNull();
    expect(homeRedirectTarget({ ...base, rooms: ["a", "b"] })).toBeNull();
    expect(homeRedirectTarget({ ...base, search: "?from=ig" })).toBeNull();
    expect(homeRedirectTarget({ ...base, search: "?all=1" })).toBeNull();
    expect(homeRedirectTarget({ ...base, search: "?source=pwa&x=1" })).toBeNull();
    expect(homeRedirectTarget({ ...base, softNav: true })).toBeNull();
    expect(homeRedirectTarget({ ...base, referrer: "https://nobangjang.com/c/주식" })).toBeNull();
  });
});

describe("room names and per-room manifest", () => {
  it("short names", () => {
    expect(roomShortName({ slug: "육아-덕후방", name: "육아방" })).toBe("육아");
    expect(roomShortName({ slug: "커피-덕후방", name: "커피 덕후방" })).toBe("커피");
    expect(roomShortName({ slug: "애니-만화-덕후방", name: "애니·만화 덕후방" })).toBe("애니·만화");
    expect(roomShortName({ slug: "주식", name: "주식" })).toBe("주식");
    expect(roomShortName({ slug: "미국주식방", name: "미국주식방" })).toBe("미국주식");
    expect(roomShortName({ slug: "반려견-덕후방", name: "애견인의 모임" })).toBe("애견");
  });

  it("starts the installed app in the room with the same icons", () => {
    const m = roomManifest({ slug: "육아-덕후방", name: "육아방" });
    const p = `/c/${encodeURIComponent("육아-덕후방")}`;
    expect(m.start_url).toBe(`${p}?source=pwa`);
    expect(m.id).toBe(p);
    expect(m.name).toBe("육아방 · 노방장");
    expect(m.short_name).toBe("육아");
    expect(m.scope).toBe("/");
    expect(m.icons).toEqual(siteManifest().icons);
    expect(siteManifest().start_url).toBe("/?source=pwa");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("home feed with my rooms (db)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { listPosts } = await import("@/lib/repo/posts");
  beforeAll(async () => {
    await query("DROP SCHEMA IF EXISTS public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("lists only posts from my rooms", async () => {
    await query("TRUNCATE posts, categories RESTART IDENTITY CASCADE");
    const ids: number[] = [];
    for (const slug of ["육아-덕후방", "커피-덕후방", "주식"]) {
      const [c] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ($1, $1, '') RETURNING id", [slug]);
      ids.push(c!.id);
    }
    for (const c of ids) await query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, 'n', 'x', 't', 'b', 'chat')", [c]);
    const mine = await listPosts({ sort: "latest", page: 1, categorySlugs: ["육아-덕후방", "주식"], hideHiddenRooms: true });
    expect(mine.items.map((p) => p.category.slug).sort()).toEqual(["육아-덕후방", "주식"].sort());
    expect(mine.total).toBe(2);
    expect((await listPosts({ sort: "latest", page: 1 })).items).toHaveLength(3);
    expect((await listPosts({ sort: "latest", page: 1, categorySlugs: ["없는-방"] })).items).toHaveLength(0);
  });

  it("counts only human comments on cards", async () => {
    const [p] = await query<{ id: string }>("SELECT id::text AS id FROM posts ORDER BY id LIMIT 1");
    const fp = "f".repeat(64);
    const add = (nick: string, ai: boolean, withFp: boolean) =>
      query("INSERT INTO comments (post_id, nickname, pw_hash, body, is_ai_curated, author_fingerprint) VALUES ($1, $2, 'x', 'hi', $3, $4)", [p!.id, nick, ai, withFp ? fp : null]);
    await add("하나", false, true);
    await add("두리", false, true);
    await add("노방장", false, true);
    await add("돈키호테", false, true);
    await add("AI 큐레이터", true, false);
    await add("익명", false, false);
    const items = (await listPosts({ sort: "latest", page: 1 })).items;
    const card = items.find((x) => x.id === p!.id)!;
    expect(card.human_comment_count).toBe(2);
    expect(items.filter((x) => x.id !== p!.id).every((x) => x.human_comment_count === 0)).toBe(true);
  });

  it("관심 방 새 글: skips posts read in the room and includes [행사]", async () => {
    const { countNew, buildReport, parseSeen } = await import("@/lib/repo/report");
    await query("TRUNCATE posts, categories RESTART IDENTITY CASCADE");
    const [c] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('러닝-덕후방', '러닝', '') RETURNING id");
    const ins = (title: string, type: string, ago: number) =>
      query(`INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, created_at) VALUES ($1, 'n', 'x', $2, 'b', $3, now() - make_interval(mins => $4))`, [c!.id, title, type, ago]);
    await ins("old info", "info", 120);
    await ins("[행사] 마라톤", "chat", 60);
    await ins("그냥 잡담", "chat", 60);
    await ins("new info", "info", 5);
    const since = new Date(Date.now() - 24 * 3600_000);
    expect(await countNew(["러닝-덕후방"], since)).toBe(3);
    const seen = parseSeen(`${encodeURIComponent("러닝-덕후방")}:${Date.now() - 30 * 60_000}`);
    expect(await countNew(["러닝-덕후방"], since, undefined, seen)).toBe(1);
    const r = await buildReport(["러닝-덕후방"], since, new Date(), undefined, seen);
    expect(r.posts.map((p) => p.title)).toEqual(["new info"]);
    expect(r.boards[0]!.newCount).toBe(1);
    expect(parseSeen("bad,%E0:1,x:abc").size).toBe(0);
  });

  it("📬 badge and /me list agree, opened posts drop out of new only, 7-day view ignores seen (10/25)", async () => {
    const { countNew, buildReport, clampSince } = await import("@/lib/repo/report");
    const ids = (await query<{ id: string; title: string }>("SELECT id::text, title FROM posts ORDER BY id")).map((r) => r);
    const opened = ids.find((r) => r.title === "new info")!.id;
    const since = new Date(Date.now() - 24 * 3600_000);
    // 배지가 센 수 = 목록 개수 = 방별 수
    const n = await countNew(["러닝-덕후방"], since);
    const r = await buildReport(["러닝-덕후방"], since);
    expect(r.total).toBe(n);
    expect(r.posts).toHaveLength(n);
    // 열어 본 글은 새 글에서 빠지고, 배지와 목록이 같이 줄어든다
    expect(await countNew(["러닝-덕후방"], since, undefined, undefined, [opened])).toBe(n - 1);
    const r2 = await buildReport(["러닝-덕후방"], since, new Date(), undefined, undefined, [opened]);
    expect(r2.posts.map((p) => p.id)).not.toContain(opened);
    expect(r2.total).toBe(n - 1);
    expect(r2.boards[0]!.newCount).toBe(n - 1);
    // 최근 7일 전체: 기준 시각·본 것 없이 요청 → 모두
    const week = await buildReport(["러닝-덕후방"], clampSince(null));
    expect(week.posts.map((p) => p.title).sort()).toEqual(["[행사] 마라톤", "new info", "old info"].sort());
  });
});
