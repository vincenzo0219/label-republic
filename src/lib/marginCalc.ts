/**
 * 반대매매 계산기 (순수 함수). 브라우저에서만 계산하고 아무것도 저장하지 않는다.
 *
 * 담보비율 = (현재가 × 보유 수량) / 신용금액 × 100
 * 반대매매 시작가 = 신용금액 × 유지비율 / 100 / 보유 수량
 * 예상 처분 수량: 처분가 p' = 현재가 × (1 − 할인율). n주를 p'에 팔아 대출을 갚고
 * 남은 주식을 현재가로 평가할 때 ((Q−n)·P) / (L − n·p') ≥ r 을 만족하는 최소 n.
 *   (Q−n)P ≥ r(L − n p')  →  n(r p' − P) ≥ rL − QP
 *   r p' > P 이면 n = ceil((rL − QP) / (r p' − P)), 아니면 회복 불가로 전량.
 *   n·p' ≥ L 이면 대출이 다 갚아지므로 ceil(L / p') 이상은 팔 필요가 없다. 보유 수량으로 상한.
 */

export type MarginInput = {
  /** 총 매수금액 (원) */
  buyAmount: number;
  /** 신용(대출) 금액 (원) */
  loan: number;
  /** 보유 수량 (주) */
  qty: number;
  /** 현재가 (원) */
  price: number;
  /** 담보유지비율 (%) */
  maintenancePct: number;
  /** 반대매매 호가 할인율 (%) */
  discountPct: number;
};

export type MarginResult = {
  /** 평가금액 = 현재가 × 수량 */
  marketValue: number;
  /** 평가손익 = 평가금액 − 매수금액 (매수금액이 없으면 null) */
  profit: number | null;
  /** 현재 담보비율 (%) */
  ratioPct: number;
  /** 반대매매 시작가 (원) */
  callPrice: number;
  /** 현재가 대비 하락률 (%). 이미 시작가 이하면 0 */
  dropPct: number;
  /** 유지비율 미달 여부 */
  below: boolean;
  /** 부족 금액 (원). 미달이 아니면 0 */
  shortfall: number;
  /** 처분가 = 현재가 × (1 − 할인율) */
  salePrice: number;
  /** 예상 처분 수량 (주). 미달이 아니면 0 */
  sellQty: number;
  /** 보유 수량으로 상한이 걸렸는지 */
  capped: boolean;
  /** 예상 처분 금액 = 처분 수량 × 처분가 */
  saleAmount: number;
};

const EPS = 1e-9;

function valid(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/** 입력이 계산 가능하면 결과, 아니면 null (신용금액·수량·현재가·유지비율은 0보다 커야 한다) */
export function calcMargin(input: MarginInput): MarginResult | null {
  const { buyAmount, loan: L, qty: Q, price: P, maintenancePct, discountPct } = input;
  if (!valid(L) || !valid(Q) || !valid(P) || !valid(maintenancePct)) return null;
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct >= 100) return null;

  const r = maintenancePct / 100;
  const d = discountPct / 100;
  const marketValue = P * Q;
  const ratioPct = (marketValue / L) * 100;
  const callPrice = (L * r) / Q;
  const below = marketValue < L * r - EPS;
  const dropPct = below ? 0 : ((P - callPrice) / P) * 100;
  const shortfall = below ? L * r - marketValue : 0;
  const salePrice = P * (1 - d);

  let sellQty = 0;
  let capped = false;
  if (below) {
    const deficit = L * r - marketValue;
    const gain = r * salePrice - P;
    let n = gain > EPS ? Math.ceil(deficit / gain - EPS) : Infinity;
    if (salePrice > 0) n = Math.min(n, Math.ceil(L / salePrice - EPS));
    if (n > Q) {
      capped = true;
      n = Q;
    }
    sellQty = Math.max(0, n);
  }

  return {
    marketValue,
    profit: valid(buyAmount) ? marketValue - buyAmount : null,
    ratioPct,
    callPrice,
    dropPct,
    below,
    shortfall,
    salePrice,
    sellQty,
    capped,
    saleAmount: sellQty * salePrice,
  };
}

/** 입력란 문자열 → 숫자 (쉼표 제거). 비면 NaN */
export function parseNum(s: string): number {
  const t = s.replace(/[,\s]/g, "");
  return t === "" ? NaN : Number(t);
}

/** 입력란에 보일 천 단위 쉼표 (소수점은 그대로) */
export function formatInput(s: string): string {
  const t = s.replace(/[^\d.]/g, "");
  const [int = "", ...rest] = t.split(".");
  const head = int.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length ? `${head}.${rest.join("")}` : head;
}

/**
 * 레버리지·인버스 ETF 기간 수익률 예시: 매일 하루 등락률의 multiple배를 추종할 때 (보수·괴리 제외).
 * 일별 등락률(%) 배열 → 기간 수익률(%). 하루 −100% 이하로 떨어지면 0에서 멈춘다.
 * 예: +10%, −10% → 지수 −1%, 2배 −4%, 인버스(−1배) −1%
 */
export function compoundReturnPct(dailyPcts: number[], multiple = 1): number | null {
  if (dailyPcts.length === 0 || dailyPcts.some((p) => !Number.isFinite(p))) return null;
  let v = 1;
  for (const p of dailyPcts) v = Math.max(0, v * (1 + (multiple * p) / 100));
  return (v - 1) * 100;
}

/** 등락률 입력란: 부호·숫자·소수점만 */
export function cleanSigned(s: string): string {
  const t = s.replace(/[−–]/g, "-").replace(/[^\d.-]/g, "");
  return (t.startsWith("-") ? "-" : "") + t.replace(/-/g, "");
}
