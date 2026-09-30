/**
 * "마그네슘 200mg 이상", "비타민D 1000~2000IU", "아연 10mg 이하", "스프링 무게 ≥ 60g" 같은
 * 성분·수치 검색어를 항목·범위·단위로 나눈다 (서버·클라이언트 공용).
 */
import { normalizeUnit, validUnit } from "./products";

export type FactQuery = {
  attribute: string;
  min?: number;
  max?: number;
  unit?: string;
  /** 비교어 없이 숫자만 적은 경우 — ±10% 로 찾는다 */
  approx: boolean;
  /** 화면 표시용 조건 설명 */
  label: string;
};

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`([a-zA-Zµμ%°Ω㎎㎍㎖ℓ㏈]{1,6})?`;
const GE = /^(이상|넘는|넘게|초과|보다\s*많은|↑|부터)$/;
const LE = /^(이하|미만|보다\s*적은|↓|까지|안\s*넘는)$/;
// 항목 이름에서 떼어낼 말
const STOP = /(함유량|함량|함유|들어\s*있는|들어간|든|짜리|제품|정도|쯤|순위|랭킹|많은|적은|높은|낮은)$/;

const num = (s: string) => Number(s.replace(",", "."));

function unitOf(raw: string | undefined): string | undefined | null {
  if (!raw) return undefined;
  const u = normalizeUnit(raw);
  return validUnit(u) ? u : null;
}

function fmt(n: number) {
  return Number(n.toPrecision(6)).toLocaleString("ko-KR", { maximumFractionDigits: 4 });
}

export function parseFactQuery(raw: string): FactQuery | null {
  const s = raw.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!/\d/.test(s)) return null;

  let min: number | undefined;
  let max: number | undefined;
  let unit: string | undefined | null;
  let approx = false;
  let rest = s;
  let cond = "";

  const range = new RegExp(String.raw`${NUM}\s*${UNIT}\s*(?:~|-|–|에서)\s*${NUM}\s*${UNIT}(?:\s*(?:사이|까지))?`).exec(s);
  const prefix = new RegExp(String.raw`(>=|<=|≥|≤|>|<)\s*${NUM}\s*${UNIT}`).exec(s);
  // 숫자가 여러 개면(오메가3, 비타민 B12, D3 …) 단위나 비교어가 붙은 것을 조건으로 보고, 나머지는 항목 이름의 일부로 둔다
  const singles = [...s.matchAll(new RegExp(String.raw`${NUM}\s*${UNIT}\s*(이상|이하|초과|미만|넘는|넘게|보다\s*많은|보다\s*적은|안\s*넘는|부터|까지|↑|↓)?`, "g"))];
  const single = singles.filter((m) => m[2] || m[3]).at(-1) ?? singles.at(-1);
  if (range) {
    const [a, b] = [num(range[1]!), num(range[3]!)];
    [min, max] = a <= b ? [a, b] : [b, a];
    unit = unitOf(range[4] ?? range[2]);
    rest = s.replace(range[0], " ");
    cond = `${fmt(min)}~${fmt(max)}${unit ? ` ${unit}` : ""}`;
  } else if (prefix) {
    const v = num(prefix[2]!);
    unit = unitOf(prefix[3]);
    if (prefix[1]!.startsWith(">") || prefix[1] === "≥") min = v;
    else max = v;
    rest = s.replace(prefix[0], " ");
    cond = `${fmt(v)}${unit ? ` ${unit}` : ""} ${min !== undefined ? "이상" : "이하"}`;
  } else if (single) {
    const v = num(single[1]!);
    unit = unitOf(single[2]);
    const u = unit ? ` ${unit}` : "";
    const word = single[3]?.replace(/\s+/g, " ");
    if (word && GE.test(word)) {
      min = v;
      cond = `${fmt(v)}${u} 이상`;
    } else if (word && LE.test(word)) {
      max = v;
      cond = `${fmt(v)}${u} 이하`;
    } else {
      approx = true;
      min = v * 0.9;
      max = v * 1.1;
      cond = `약 ${fmt(v)}${u} (±10%)`;
    }
    rest = s.slice(0, single.index) + " " + s.slice(single.index! + single[0].length);
  } else {
    return null;
  }
  if (unit === null) return null; // 단위로 볼 수 없는 글자
  if (min !== undefined && !Number.isFinite(min)) return null;
  if (max !== undefined && !Number.isFinite(max)) return null;

  let attribute = rest.replace(/[()[\]{}"',.?!:]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) attribute = attribute.replace(STOP, "").trim();
  attribute = attribute.replace(/\s*(이|가|은|는|을|를|의)$/, "").trim();
  // 항목 이름은 글자·숫자·공백과 몇 가지 기호만 (그 밖의 글자가 남았으면 수치 검색어가 아니다)
  if (!/[\p{L}]/u.test(attribute) || [...attribute].length > 40 || /[^\p{L}\p{N} ·\-+/]/u.test(attribute)) return null;

  return {
    attribute,
    min,
    max,
    unit: unit ?? undefined,
    approx,
    label: `${attribute} ${cond}`,
  };
}

/** 폼·쿼리의 숫자 칸: 빈 칸("")은 조건 없음 — Number("") 는 0 이 되므로 따로 거른다 */
export function numParam(raw: string | null | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? n : undefined;
}
