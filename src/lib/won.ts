/**
 * 💳 넣어둬 가격 칸 (10/30 대표님 "가격에 원자 입력은 안되고 숫자만. 만원이라고 칠때는 >> 자유롭게 수정해줘").
 * "1만원", "3만5천", "1.5만", "12만9천", "1백만원", "35,000원" 같은 말을 원 단위 숫자로. 못 읽으면 null.
 */
const BIG: Record<string, number> = { 억: 100_000_000, 만: 10_000 };
const SMALL: Record<string, number> = { 천: 1000, 백: 100, 십: 10 };

export function parseWon(input: string): number | null {
  const s = input.replace(/[\s,원]/g, "");
  if (!s) return null;
  const re = /(\d+(?:\.\d+)?)|([억만천백십])/gy;
  let total = 0;
  let section = 0;
  let num: number | null = null;
  let used = 0;
  let lastBig = Infinity;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    used = re.lastIndex;
    if (m[1] !== undefined) {
      if (num !== null) return null; // 숫자 두 개가 붙어 있음
      num = Number(m[1]);
    } else if (SMALL[m[2]!]) {
      section += (num ?? 1) * SMALL[m[2]!]!;
      num = null;
    } else {
      if (BIG[m[2]!]! >= lastBig) return null; // "만만"처럼 큰 단위가 거꾸로·두 번
      lastBig = BIG[m[2]!]!;
      section += num ?? 0;
      total += (section || 1) * BIG[m[2]!]!;
      section = 0;
      num = null;
    }
  }
  if (used !== s.length) return null;
  total += section + (num ?? 0);
  const won = Math.round(total);
  return Number.isFinite(won) && won > 0 ? won : null;
}
