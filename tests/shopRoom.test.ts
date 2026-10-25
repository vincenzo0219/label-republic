import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convertItem, parseHandoff, tabKey } from "../scripts/bizpilot-import.mjs";
import { ALL_HEADS, NO_INFO_TAB, SHOP_ROOM, headOf, tabHeadsFor } from "@/lib/heads";
import { pinnedOrder } from "@/lib/repo/posts";
import {
  cleanText, feedItems, feedSchema, feedTitle, tabKeyOf,
  PIN_ALL, kstDate, noticeDay, noticeText, pinnedTabFor, roundupSunday, stripsHead, weekText,
} from "@/lib/shopRoom";

const DIR = path.join(__dirname, "../docs/promo/bizpilot");
const md = fs.readFileSync(path.join(DIR, "2026-10-26.md"), "utf8");
const overrides = JSON.parse(fs.readFileSync(path.join(DIR, "2026-10-26.overrides.json"), "utf8"));
type P = { key: string; head: string; title: string; body: string; publishAt: string; imageUrls: string[]; problems: string[]; warnings: string[] };
const parsed = parseHandoff(md, { year: 2026, overrides }) as unknown as { faqs: P[]; posts: P[] };
const post = (key: string): P => parsed.posts.find((p) => p.key === key)!;

describe("🏪 오늘도 장사중 탭", () => {
  it("💬 채팅 뒤 다섯 탭, 이 순서 · 📋 정보 탭 없음", () => {
    expect(tabHeadsFor(SHOP_ROOM).map((h) => h.label)).toEqual(["💸 남는 돈 계산", "👥 직원·알바", "📍 상권·자리", "🎫 지원사업·마감", "🏆 잘된 가게"]);
    expect(NO_INFO_TAB.has(SHOP_ROOM)).toBe(true);
    expect(tabHeadsFor(SHOP_ROOM).some((h) => h.label.includes("우리 가게"))).toBe(false);
  });
  it("말머리 키는 겹치지 않고 제목 앞 [계산] 으로 읽힌다", () => {
    const keys = ALL_HEADS.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(headOf("[계산] [☀️ 아침 계산 #2] 쿠폰")).toBe("계산");
    expect(headOf("[가게] 📌 이 탭에서 계속 나오는 공통점")).toBe("가게");
  });
  it("원고 탭 이름 → 말머리", () => {
    expect(tabKey("👥 직원·알바")).toBe("직원");
    expect(tabKey("🏆 잘된 가게")).toBe("가게");
    expect(tabKey("💬 자유채팅")).toBeNull();
  });
});

describe("고정 글 (탭 맨 위)", () => {
  it("이 방 탭이면 그 말머리, 전체 탭이면 '*', 다른 방은 없음", () => {
    expect(pinnedTabFor(SHOP_ROOM, { head: "계산" })).toBe("계산");
    expect(pinnedTabFor(SHOP_ROOM, {})).toBe(PIN_ALL);
    expect(pinnedTabFor(SHOP_ROOM, { type: "info" })).toBeUndefined();
    expect(pinnedTabFor("커피-덕후방", { head: "자랑" })).toBeUndefined();
    expect(stripsHead(SHOP_ROOM)).toBe(true);
  });
  it("정렬 앞에 고정 글 조건을 붙이고 인자를 하나 더한다 (다른 방은 그대로)", () => {
    const args: unknown[] = [1];
    expect(pinnedOrder("계산", args)).toBe("(p.pinned_tab IS NOT DISTINCT FROM $2) DESC, ");
    expect(args).toEqual([1, "계산"]);
    const none: unknown[] = [1];
    expect(pinnedOrder(undefined, none)).toBe("");
    expect(none).toEqual([1]);
  });
});

describe("10/26 주 원고 변환", () => {
  const all = [...parsed.faqs, ...parsed.posts];
  it("고정 글 5개(탭마다 하나) + 6일 × 5칸, 고칠 것 없음", () => {
    expect(parsed.faqs.map((f: P) => f.head)).toEqual(["계산", "직원", "상권", "지원", "가게"]);
    expect(parsed.posts).toHaveLength(30);
    expect(all.flatMap((x: P) => x.problems)).toEqual([]);
    for (const p of parsed.posts) expect(["0830", "1030", "1430", "1600", "2230"]).toContain(p.key.slice(11));
  });
  it("각 글은 머리줄의 탭으로, 시각은 KST", () => {
    const first = parsed.posts[0];
    expect(first.key).toBe("2026-10-26-0830");
    expect(first.publishAt).toBe("2026-10-26T08:30:00+09:00");
    expect(first.head).toBe("직원");
    expect(post("2026-10-31-1600").head).toBe("지원");
  });
  it("질문 제목은 본문 숫자만 쓴 단정문으로", () => {
    const t = post("2026-10-28-0830").title;
    expect(t).toBe("[직원] [☀️ 아침 계산 #3] 직원 한 명은 하루 손님 19명");
    for (const p of parsed.posts) expect(p.title).not.toMatch(/\?/);
  });
  it("em dash 없음 · 부탁 문장 없음 · 질문으로 끝나지 않음", () => {
    for (const p of all) {
      expect(`${p.title}\n${p.body}`).not.toMatch(/[—―]/);
      expect(p.body).not.toMatch(/댓글로 알려 주세요|저장해 두고|친구에게도 공유|효자 메뉴는 뭔가요/);
      expect(p.body.trim()).not.toMatch(/\?$/);
    }
  });
  it("bizpilot 주소는 ☀️ 아침 계산 글에만, utm_source=nobangjang", () => {
    for (const p of parsed.posts) {
      const morning = p.title.includes("☀️ 아침 계산");
      expect(/bizpilot\.kr/.test(p.body)).toBe(morning);
      if (morning) expect(p.body).toMatch(/https:\/\/bizpilot\.kr\/\?utm_source=nobangjang&utm_campaign=\d{4}_\w+/);
    }
  });
  it("🖼 카드는 그림 주소를 떼어 붙이고 '그림:' 줄은 지운다", () => {
    const cards = parsed.posts.filter((p: P) => p.title.includes("🖼 오늘의 카드"));
    expect(cards).toHaveLength(6);
    for (const c of cards) {
      expect(c.imageUrls.length).toBeGreaterThan(0);
      expect(c.body).not.toMatch(/그림\s*:/);
    }
    for (const p of parsed.posts.filter((x: P) => !x.title.includes("🖼"))) expect(p.imageUrls).toEqual([]);
  });
  it("여러 문장인 긴 첫 줄은 첫 문장만 제목, 나머지는 본문 맨 앞", () => {
    const p = post("2026-10-29-1430");
    expect(p.title).toBe("[상권] [📍 오늘의 자리 #4] 서울 역삼1동은 평일 낮 2시 사람 수가 새벽 3시의 4.4배예요");
    expect(p.body.startsWith("저녁 7시에는")).toBe(true);
  });
  it("질문 제목에 고칠 제목이 없으면 멈춘다 · 원문에 없는 숫자도 멈춘다", () => {
    expect(convertItem("[☀️ 아침 계산 #9] 몇 명일까요?\n본문 3명", { slotKey: "x", head: "계산" }).problems.length).toBe(1);
    const bad = convertItem("[☀️ 아침 계산 #9] 몇 명일까요?\n본문 3명", { slotKey: "x", head: "계산", overrides: { titles: { x: "하루 7명" } } });
    expect(bad.problems.join()).toMatch(/원문에 없는 숫자/);
  });
});

describe("오늘 올라올 글 공지 · 이번 주 모아 보기", () => {
  const items = parsed.posts
    .filter((p: P) => p.key.startsWith("2026-10-26-"))
    .map((p: P) => ({ publishAt: new Date(p.publishAt), head: p.head, title: p.title }));
  it("07:30 전에는 어제, 뒤에는 오늘", () => {
    expect(noticeDay(kstDate("2026-10-26", "07:29"))).toBe("2026-10-25");
    expect(noticeDay(kstDate("2026-10-26", "07:30"))).toBe("2026-10-26");
  });
  it("제목 목록 5개 + 방 규칙", () => {
    const n = noticeText("2026-10-26", items);
    expect(n.title).toBe("📅 오늘 올라올 글 5개 · 10/26(월)");
    expect(n.body.split("\n")[0]).toBe("08:30 · 👥 직원·알바");
    expect(n.body).toContain("[☀️ 아침 계산 #1]");
    expect(n.body).not.toContain("[직원]");
    expect(n.body).toContain("자살예방상담 109");
    expect(noticeText("2026-10-25", []).title).toContain("방 규칙");
  });
  it("일요일 22:31 ~ 월요일 07:00 에만, 탭 순서대로", () => {
    expect(roundupSunday(kstDate("2026-11-01", "22:30"))).toBeNull();
    expect(roundupSunday(kstDate("2026-11-01", "22:31"))).toBe("2026-11-01");
    expect(roundupSunday(kstDate("2026-11-02", "06:59"))).toBe("2026-11-01");
    expect(roundupSunday(kstDate("2026-10-31", "23:00"))).toBeNull();
    const w = weekText("2026-11-01", items)!;
    expect(w.title).toBe("🗓 이번 주 모아 보기 · 10/26(월)~11/1(일)");
    expect(w.body.indexOf("👥 직원·알바")).toBeLessThan(w.body.indexOf("📍 상권·자리"));
    expect(weekText("2026-11-01", [])).toBeNull();
  });
});

describe("비즈파일럿 피드", () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/bizpilot-feed.json"), "utf8"));
  const feed = feedSchema.parse(fixture);
  it("문서의 모양 그대로 읽힌다 (10/26~31 30개 + 고정 5개)", () => {
    expect(feed.posts).toHaveLength(30);
    expect(feed.pinned).toHaveLength(5);
  });
  it("탭 이름 → 말머리, 💬 자유채팅·모르는 탭은 없음", () => {
    expect(tabKeyOf("💸 남는 돈 계산")).toBe("계산");
    expect(tabKeyOf("🎫 지원사업·마감")).toBe("지원");
    expect(tabKeyOf("💬 자유채팅")).toBeNull();
    expect(tabKeyOf("📸 우리 가게")).toBeNull();
  });
  it("칸 key 는 피드 id, 시각은 at, 하루 넘게 지난 글은 건너뛴다", () => {
    const { items, skipped, problems } = feedItems(feed, kstDate("2026-10-27", "09:00"));
    expect(problems).toEqual([]);
    expect(skipped).toEqual(["2026-10-26-0830"]);
    const first = items.find((i) => i.key === "2026-10-26-1030")!;
    expect(first.head).toBe("상권");
    expect(first.publishAt.toISOString()).toBe("2026-10-26T01:30:00.000Z");
    expect(first.imageUrls).toHaveLength(4);
    expect(first.title).toBe('[상권] [🖼 오늘의 카드 #1] 주소에 "몇 호"까지 넣어야 하는 이유');
    const pins = items.filter((i) => i.pinned);
    expect(pins.map((i) => i.key)).toEqual(["pin:계산", "pin:직원", "pin:상권", "pin:지원", "pin:가게"]);
    expect(pins[0]!.title).toBe("[계산] 📌 자주 묻는 질문 정답");
  });
  it("em dash·그림 줄 정리, 말머리는 한 번만", () => {
    expect(cleanText("가 — 나\n그림: https://x\n\n\n다")).toBe("가, 나\n\n다");
    expect(feedTitle("계산", "[계산] 제목.")).toBe("[계산] 제목");
  });
  it("모양이 틀린 피드는 받지 않는다", () => {
    expect(feedSchema.safeParse({ posts: [{ id: "x", at: "2026-10-26T08:30:00", tab: "a", title: "b" }] }).success).toBe(false);
    expect(feedSchema.safeParse({}).success).toBe(true);
  });
});
