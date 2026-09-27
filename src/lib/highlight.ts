export type Segment = { text: string; match: boolean };

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 공백으로 구분된 검색어(최대 5개) */
export function searchTerms(q: string): string[] {
  return Array.from(new Set(q.trim().split(/\s+/).filter(Boolean))).slice(0, 5);
}

/** 텍스트를 검색어 일치/비일치 구간으로 나눈다 (대소문자 무시). React에서 <mark>로 렌더링. */
export function highlight(text: string, terms: string[]): Segment[] {
  if (!terms.length || !text) return [{ text, match: false }];
  const re = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return text
    .split(re)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, match: terms.some((t) => t.toLowerCase() === part.toLowerCase()) }));
}

/** 첫 번째 일치 위치 주변을 잘라낸 스니펫 */
export function snippet(text: string, terms: string[], radius = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const idx = terms.map((t) => lower.indexOf(t.toLowerCase())).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (idx === undefined) return flat.length > radius * 2 ? flat.slice(0, radius * 2) + "…" : flat;
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + radius);
  return (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : "");
}
