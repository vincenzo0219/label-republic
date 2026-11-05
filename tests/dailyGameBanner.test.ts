import { describe, expect, it } from "vitest";
import { dailyGameOf } from "@/components/DailyGameBanner";

// 11/5: 하루 게임은 방 맨 위 큰 카드로 (칩만 있을 때 첫날 연 사람 0명)
describe("dailyGameOf", () => {
  it("책·애니·K리그 방은 하루 게임을 돌려준다", () => {
    expect(dailyGameOf("읽는-책-제목을-교환해-보자")?.id).toBe("booksent");
    expect(dailyGameOf("애니-만화-덕후방")?.id).toBe("anichosung");
    expect(dailyGameOf("k리그-덕후방")?.id).toBe("kmatch");
  });
  it("하루 게임이 없는 방은 null", () => {
    expect(dailyGameOf("게임-덕후방")).toBeNull();
    expect(dailyGameOf("커피-덕후방")).toBeNull();
  });
});
