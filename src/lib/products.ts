/**
 * 제품·수치 공용 규칙 (서버·클라이언트).
 *
 * 제품은 누구나 글에 태그하면서 만든다. 같은 보드에서 브랜드·제품명이 표기만 다른 경우
 * (대소문자·띄어쓰기·기호)는 같은 제품으로 합친다.
 */

export const MAX_PRODUCTS_PER_POST = 3;
export const MAX_FACTS_PER_POST = 20;

export type FactKind = "label" | "measured";
export const FACT_KIND_LABEL: Record<FactKind, string> = { label: "표시값", measured: "실측값" };

/** 비교용 정규화: NFKC → 소문자 → 문자·숫자만 */
export function normText(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function productKey(brand: string, name: string): string {
  return `${normText(brand)}|${normText(name)}`;
}

export function attrKey(attribute: string): string {
  return normText(attribute).slice(0, 40);
}

/** 단위 표기 통일 (mcg·μg → µg, iu → IU, ㎎ → mg, 마이크로그램 → µg …) */
const UNIT_ALIASES: Record<string, string> = {
  mcg: "µg", ug: "µg", "μg": "µg", "㎍": "µg", "µg": "µg", 마이크로그램: "µg", 마이크로: "µg",
  mg: "mg", "㎎": "mg", 밀리그램: "mg", 미리그램: "mg", g: "g", 그램: "g", kg: "kg", "㎏": "kg", 킬로그램: "kg",
  iu: "IU", 아이유: "IU", ml: "ml", "㎖": "ml", 밀리리터: "ml", l: "L", "ℓ": "L", 리터: "L",
  kcal: "kcal", "%": "%", db: "dB", hz: "Hz", khz: "kHz", ohm: "Ω", "ω": "Ω", mah: "mAh", mm: "mm", cm: "cm",
};

export function normalizeUnit(raw: string): string {
  const t = raw.normalize("NFKC").trim();
  const alias = UNIT_ALIASES[t.toLowerCase()] ?? UNIT_ALIASES[t];
  return alias ?? t;
}

export function validUnit(unit: string): boolean {
  return /^[\p{L}%°Ωµ]{1,12}$/u.test(unit);
}

/** 서로 바꿔 계산할 수 있는 단위 묶음 → 기준 단위 배수 */
const UNIT_GROUPS: Record<string, { group: string; factor: number }> = {
  "µg": { group: "mass", factor: 0.001 },
  mg: { group: "mass", factor: 1 },
  g: { group: "mass", factor: 1000 },
  kg: { group: "mass", factor: 1_000_000 },
  ml: { group: "volume", factor: 1 },
  L: { group: "volume", factor: 1000 },
  mm: { group: "length", factor: 1 },
  cm: { group: "length", factor: 10 },
  Hz: { group: "freq", factor: 1 },
  kHz: { group: "freq", factor: 1000 },
};

/**
 * 국제단위(IU)를 질량으로 바꿀 수 있는 성분 (Sprint 35). 비타민 D 는 형태(D2·D3)와 상관없이 1 µg = 40 IU 로 정해져 있다.
 * 비타민 A·E 는 형태(레티놀·베타카로틴, 천연·합성 토코페롤)마다 환산값이 달라 라벨만으로는 알 수 없어 바꾸지 않는다.
 * 키는 attrKey 로 정규화한 항목 이름 — 별칭으로 합쳐진 대표 키든 원래 키든 들어 있으면 바꾼다.
 * DB 의 같은 규칙: db/migrations/033_attribute_aliases.sql (tests/attr-aliases.test.ts 가 둘이 같은지 확인)
 */
export const IU_MG: Record<string, number> = Object.fromEntries(
  ["비타민d", "비타민d3", "비타민d2", "vitamind", "vitamind3", "vitamind2", "콜레칼시페롤", "cholecalciferol", "에르고칼시페롤", "ergocalciferol"].map((k) => [k, 0.000025]),
);

/** 이 항목에서 IU 를 질량(mg)으로 바꾸는 배수, 없으면 null */
export function iuFactor(attr: string | undefined): number | null {
  return attr ? IU_MG[attr] ?? null : null;
}

/** 같은 묶음이면 기준 단위 값으로, 아니면 단위 자체를 묶음으로 본다. 항목 키를 주면 성분별 IU 환산(비타민 D)도 한다 */
export function toBase(value: number, unit: string, attr?: string): { group: string; base: number } {
  const iu = unit === "IU" ? iuFactor(attr) : null;
  if (iu !== null) return { group: "mass", base: value * iu };
  const g = UNIT_GROUPS[unit];
  return g ? { group: g.group, base: value * g.factor } : { group: `unit:${unit}`, base: value };
}

/** base 값을 target 단위로 */
export function fromBase(base: number, unit: string, attr?: string): number {
  const iu = unit === "IU" ? iuFactor(attr) : null;
  if (iu !== null) return base / iu;
  const g = UNIT_GROUPS[unit];
  return g ? base / g.factor : base;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function formatValue(v: number): string {
  if (v >= 100) return Math.round(v).toLocaleString("ko-KR");
  return Number(v.toPrecision(3)).toLocaleString("ko-KR", { maximumFractionDigits: 3 });
}

/** 입력 문자열 검증 — 제품명에 링크·연락처를 넣어 광고로 쓰지 못하게 */
export function productNameProblem(brand: string, name: string): string | null {
  if (!brand.trim() || !name.trim()) return "브랜드와 제품명을 모두 입력해주세요.";
  if (brand.trim().length > 60) return "브랜드는 60자까지 입력할 수 있습니다.";
  if (name.trim().length > 120) return "제품명은 120자까지 입력할 수 있습니다.";
  const text = `${brand} ${name}`;
  if (/https?:\/\/|www\.|\.(com|kr|net|co)\b/i.test(text)) return "제품명에는 링크를 넣을 수 없습니다.";
  if (/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|카톡|오픈\s*채팅|텔레그램/.test(text)) return "제품명에는 연락처를 넣을 수 없습니다.";
  if (!normText(brand) || !normText(name)) return "브랜드와 제품명에 글자나 숫자가 있어야 합니다.";
  return null;
}
