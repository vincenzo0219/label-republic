import { describe, expect, it } from "vitest";
import { calcMargin, formatInput, parseNum, type MarginInput } from "@/lib/marginCalc";

const base: MarginInput = { buyAmount: 20_000_000, loan: 10_000_000, qty: 1000, price: 20_000, maintenancePct: 140, discountPct: 20 };

describe("반대매매 계산기 — 순수 계산", () => {
  it("정상: 유지비율 위 (현재가 2만, 신용 1천만, 1000주)", () => {
    const r = calcMargin(base)!;
    expect(r.marketValue).toBe(20_000_000);
    expect(r.profit).toBe(0);
    expect(r.ratioPct).toBeCloseTo(200, 9);
    // 1천만 × 1.4 / 1000 = 14,000원
    expect(r.callPrice).toBeCloseTo(14_000, 9);
    // (20000 − 14000) / 20000 = 30%
    expect(r.dropPct).toBeCloseTo(30, 9);
    expect(r.below).toBe(false);
    expect(r.shortfall).toBe(0);
    expect(r.sellQty).toBe(0);
    expect(r.salePrice).toBe(16_000);
  });

  it("정확히 유지비율이면 미달 아님, 하락률 0", () => {
    const r = calcMargin({ ...base, price: 14_000 })!;
    expect(r.ratioPct).toBeCloseTo(140, 9);
    expect(r.below).toBe(false);
    expect(r.dropPct).toBeCloseTo(0, 9);
    expect(r.sellQty).toBe(0);
  });

  it("이미 미달: 계산 예시 (신용 500만, 1000주, 현재가 6,500원)", () => {
    const input = { ...base, buyAmount: 8_000_000, loan: 5_000_000, price: 6_500 };
    const r = calcMargin(input)!;
    expect(r.ratioPct).toBeCloseTo(130, 9);
    expect(r.callPrice).toBeCloseTo(7_000, 9);
    expect(r.below).toBe(true);
    expect(r.dropPct).toBe(0);
    // 7,000,000 − 6,500,000
    expect(r.shortfall).toBeCloseTo(500_000, 6);
    expect(r.salePrice).toBe(5_200);
    // n ≥ 500,000 / (1.4×5,200 − 6,500) = 500,000 / 780 = 641.03 → 642주
    expect(r.sellQty).toBe(642);
    expect(r.capped).toBe(false);
    expect(r.saleAmount).toBe(642 * 5_200);
    expect(r.profit).toBe(-1_500_000);
    // 손으로 검산: 642주면 회복, 641주면 미달
    const ratio = (n: number) => ((1000 - n) * 6_500) / (5_000_000 - n * 5_200);
    expect(ratio(642)).toBeGreaterThanOrEqual(1.4);
    expect(ratio(641)).toBeLessThan(1.4);
  });

  it("또 다른 예시: 유지비율 130%, 할인율 15%", () => {
    // L=3천만, Q=2000, P=18,000 → 평가 3,600만, 비율 120%
    const r = calcMargin({ buyAmount: 0, loan: 30_000_000, qty: 2000, price: 18_000, maintenancePct: 130, discountPct: 15 })!;
    expect(r.ratioPct).toBeCloseTo(120, 9);
    expect(r.callPrice).toBeCloseTo(19_500, 9);
    expect(r.shortfall).toBeCloseTo(3_000_000, 6);
    expect(r.salePrice).toBeCloseTo(15_300, 9);
    // 3,000,000 / (1.3×15,300 − 18,000) = 3,000,000 / 1,890 = 1587.3 → 1588주
    expect(r.sellQty).toBe(1588);
    expect(r.capped).toBe(false);
    expect(r.profit).toBeNull();
    const ratio = (n: number) => ((2000 - n) * 18_000) / (30_000_000 - n * 15_300);
    expect(ratio(1588)).toBeGreaterThanOrEqual(1.3);
    expect(ratio(1587)).toBeLessThan(1.3);
  });

  it("보유 수량으로 상한: 필요한 수량이 보유보다 많으면 전량", () => {
    // L=1천만, Q=1000, P=12,000 → 1.4×9,600 − 12,000 = 1,440, 2,000,000/1,440 = 1388.9 → 1389 > 1000
    const r = calcMargin({ ...base, price: 12_000 })!;
    expect(r.below).toBe(true);
    expect(r.sellQty).toBe(1000);
    expect(r.capped).toBe(true);
    expect(r.saleAmount).toBe(9_600_000);
  });

  it("할인 후 처분가로는 비율이 못 올라가면 (r·p′ ≤ P) 전량", () => {
    // 할인율 40%: 1.4×0.6 = 0.84 < 1 → 팔수록 비율이 내려간다
    const r = calcMargin({ ...base, price: 13_000, discountPct: 40 })!;
    expect(r.salePrice).toBe(7_800);
    expect(r.sellQty).toBe(1000);
    expect(r.capped).toBe(true);
  });

  it("0·잘못된 입력은 null", () => {
    expect(calcMargin({ ...base, loan: 0 })).toBeNull();
    expect(calcMargin({ ...base, qty: 0 })).toBeNull();
    expect(calcMargin({ ...base, price: 0 })).toBeNull();
    expect(calcMargin({ ...base, maintenancePct: 0 })).toBeNull();
    expect(calcMargin({ ...base, price: NaN })).toBeNull();
    expect(calcMargin({ ...base, loan: -1 })).toBeNull();
    expect(calcMargin({ ...base, discountPct: -5 })).toBeNull();
    expect(calcMargin({ ...base, discountPct: 100 })).toBeNull();
    expect(calcMargin({ ...base, qty: Infinity })).toBeNull();
    // 매수금액은 없어도 계산된다
    expect(calcMargin({ ...base, buyAmount: NaN })?.profit).toBeNull();
    // 할인율 0%도 계산된다
    expect(calcMargin({ ...base, discountPct: 0 })?.salePrice).toBe(20_000);
  });

  it("입력 표시: 천 단위 쉼표와 파싱", () => {
    expect(formatInput("10000000")).toBe("10,000,000");
    expect(formatInput("1,2a34")).toBe("1,234");
    expect(formatInput("0012")).toBe("12");
    expect(formatInput("140.5")).toBe("140.5");
    expect(formatInput("")).toBe("");
    expect(parseNum("10,000,000")).toBe(10_000_000);
    expect(parseNum("")).toBeNaN();
  });
});
