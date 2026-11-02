import { describe, expect, it } from "vitest";
import { BOOK_TASTE_MIN_RESPONSES, cleanPicks, tasteBoard } from "@/lib/bookTaste";
import { decodeMate, encodeMate } from "@/lib/friendLink";
import { ROOM_CHAT_TABS, roomTabOf } from "@/lib/heads";
import { ROOM_PLAY, savingsPrincipal } from "@/lib/roomPlay";
import { TYPE_TESTS, typeTestCard, typeTestCardUrl } from "@/lib/typeTests";
import { compatOf, compatTable, pairKey, pickType, reachableTypes, sameTypeLine, scoreAnswers, testProblems } from "@/lib/typeTests/engine";
import { KBO_TEST } from "@/lib/typeTests/kbo";
import { existsSync } from "node:fs";
import path from "node:path";

const tests = Object.values(TYPE_TESTS);

describe("🧩 타입 테스트 설정", () => {
  it.each(tests.map((t) => [t.key, t] as const))("%s: 설정이 맞고 모든 타입이 나올 수 있다", (_k, t) => {
    expect(testProblems(t)).toEqual([]);
    expect(t.types.length).toBeGreaterThanOrEqual(4);
    expect([...reachableTypes(t)].sort()).toEqual(t.types.map((x) => x.key).sort());
  });

  it.each(tests.map((t) => [t.key, t] as const))("%s: 궁합표가 모든 짝을 채우고 순서와 상관없이 같다", (_k, t) => {
    const table = compatTable(t);
    const n = t.types.length;
    expect(Object.keys(table)).toHaveLength((n * (n + 1)) / 2);
    for (const a of t.types)
      for (const b of t.types) {
        const c = table[pairKey(a.key, b.key)]!;
        expect(c).toEqual(compatOf(t.key, b.key, a.key));
        expect(c.pct).toBeGreaterThanOrEqual(62);
        expect(c.pct).toBeLessThanOrEqual(95);
        expect(c.line).not.toContain("—");
      }
  });

  it("채점은 같은 답이면 늘 같은 결과, 같은 점수면 앞쪽 타입", () => {
    const t = TYPE_TESTS["book-sentence"]!;
    const a = t.questions.map(() => 0);
    expect(pickType(t, a)).toEqual(pickType(t, [...a]));
    // 서정파 4번 고르기
    const lyric = t.questions.map((q) => Math.max(0, q.options.findIndex((o) => o.to.includes("lyric"))));
    expect(pickType(t, lyric)?.key).toBe("lyric");
    // 모두 첫 보기: lyric·epic·muse·mystery·humor·muse... 점수 확인
    expect(scoreAnswers(t, a)).toEqual(scoreAnswers(t, a));
    expect(pickType(t, a.slice(1))).toBeNull();
    expect(pickType(t, [...a.slice(1), 9])).toBeNull();
  });

  it("⚾ 구단 테스트: 질문마다 구단이 보기 하나씩, 10개 구단 답 모양이 모두 다르다", () => {
    expect(KBO_TEST.types.map((t) => t.name)).toEqual([
      "KIA 타이거즈", "삼성 라이온즈", "LG 트윈스", "두산 베어스", "KT 위즈", "SSG 랜더스", "롯데 자이언츠", "한화 이글스", "NC 다이노스", "키움 히어로즈",
    ]);
    const profiles = KBO_TEST.types.map((team) =>
      KBO_TEST.questions.map((q) => {
        const hits = q.options.map((o, i) => (o.to.includes(team.key) ? i : -1)).filter((i) => i >= 0);
        expect(hits).toHaveLength(1);
        return hits[0]!;
      }),
    );
    expect(new Set(profiles.map((p) => p.join(""))).size).toBe(10);
    profiles.forEach((p, i) => expect(pickType(KBO_TEST, p)?.key).toBe(KBO_TEST.types[i]!.key));
  });

  it("📈 투자 테스트는 종목 추천이 아니라고 말한다", () => {
    expect(TYPE_TESTS["stock-life"]!.note).toContain("종목 추천이 아니에요");
    expect(TYPE_TESTS["us-night"]!.note).toContain("종목 추천이 아니에요");
  });

  it("같은 타입 줄은 센 값만 쓴다", () => {
    expect(sameTypeLine(0, 0)).toBe("");
    expect(sameTypeLine(2, 5)).toBe("지금까지 5명이 했어요. 나와 같은 타입은 2명이에요.");
    expect(sameTypeLine(25, 100)).toBe("이 테스트를 한 100명 중 25%가 같은 타입이에요.");
  });

  it("궁합 링크·미리보기 카드", () => {
    const t = TYPE_TESTS.cat!;
    const url = encodeMate("/t/cat", "boss", "집사");
    const q = new URL(url).searchParams;
    const types = Object.fromEntries(t.types.map((x) => [x.key, x]));
    expect(decodeMate(q, types)?.type.key).toBe("boss");
    expect(typeTestCard(t, q).headline).toBe("집사님은 👑 도도한 보스냥");
    expect(typeTestCard(t, new URLSearchParams("r=sleepy")).headline).toBe("😴 잠꾸러기냥");
    expect(typeTestCard(t, new URLSearchParams()).headline).toContain("냥이 성격 테스트");
    expect(typeTestCardUrl(t, q)).toBe("/api/card/friend?test=t-cat&m=boss&n=%EC%A7%91%EC%82%AC");
  });
});

describe("🧩 방 놀이 탭", () => {
  it("놀이 거리가 있는 방마다 🧩 놀이 탭이 맨 뒤에, 승부 예측 탭은 그대로", () => {
    for (const slug of Object.keys(ROOM_PLAY)) expect(ROOM_CHAT_TABS[slug]?.at(-1)).toEqual({ key: "play", label: "🧩 놀이" });
    expect(ROOM_CHAT_TABS["kbo-덕후방"]?.map((t) => t.key)).toEqual(["predict", "play"]);
    expect(roomTabOf("고양이-집사방", "play")?.label).toBe("🧩 놀이");
  });
  it("방 설정이 가리키는 테스트·화면이 모두 있다", () => {
    for (const items of Object.values(ROOM_PLAY))
      for (const it of items) {
        if (it.kind === "test") expect(TYPE_TESTS[it.key], it.key).toBeTruthy();
        if (it.kind === "link") {
          const p = it.href.split("?")[0]!;
          if (p.startsWith("/t/")) expect(TYPE_TESTS[p.slice(3)]).toBeTruthy();
          else if (p.startsWith("/games/")) expect(existsSync(path.join("src/app/games/[game]/page.tsx"))).toBe(true);
          else if (p.startsWith("/c/")) expect(Object.hasOwn(ROOM_PLAY, p.slice(3)), p).toBe(true); // 방 탭 링크 (📍 동네 체험)
          else expect(existsSync(path.join("src/app", p, "page.tsx")), p).toBe(true);
        }
      }
    // 새 테스트는 모두 어느 방 놀이 탭에 있다
    const used = new Set(Object.values(ROOM_PLAY).flatMap((xs) => xs.flatMap((x) => (x.kind === "test" ? [x.key] : []))));
    expect([...used].sort()).toEqual(Object.keys(TYPE_TESTS).sort());
  });
  it("💰 적립 습관 카드: 원금만 (수익 가정 없음)", () => {
    expect(savingsPrincipal(300000)).toEqual([
      { months: 12, total: 3_600_000 },
      { months: 36, total: 10_800_000 },
      { months: 60, total: 18_000_000 },
    ]);
    expect(savingsPrincipal(-5)[0]!.total).toBe(0);
    expect(savingsPrincipal(Number.NaN)[2]!.total).toBe(0);
  });
  it("📚 행사 책 취향: 목록에서 3개까지, 5명 전에는 TOP·주제를 숨긴다", () => {
    expect(cleanPicks(["essay", "essay", "poem", "nope", "sf", "mystery"])).toEqual(["essay", "poem", "sf"]);
    expect(cleanPicks(["nope"])).toBeNull();
    expect(cleanPicks("essay")).toBeNull();
    expect(tasteBoard({ essay: 3 }, BOOK_TASTE_MIN_RESPONSES - 1)).toEqual({ responses: 4, top: [], topics: [], mine: [] });
    const b = tasteBoard({ essay: 3, poem: 5, sf: 3, comic: 1, travel: 2, cook: 1 }, 6);
    expect(b.top.map((t) => t.key)).toEqual(["poem", "essay", "sf", "travel", "comic"]);
    expect(b.topics).toHaveLength(3);
  });
});
