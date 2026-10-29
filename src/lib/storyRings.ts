/**
 * ⭕ 홈 내 방 동그라미 (10/29, 인스타 스토리처럼). 서버·브라우저·테스트 공용 순수 함수.
 * 색 동그라미: 오늘 🧩 퀴즈를 아직 안 했거나, 마지막으로 본 뒤 새 글·채팅이 있는 방. 보고 나면 회색.
 */
export type Ring = { quiz: boolean; fresh: boolean };
export type Rings = Record<string, Ring>;

const SLUG = /^[\p{L}\p{N}-]{1,60}$/u;
export const RING_MAX = 30;
/** 한 번도 안 들어간 방은 하루 안에 올라온 글만 새 글로 친다 */
export const FIRST_LOOK_MS = 24 * 3600_000;

/** ?slugs=a,b&s=a:ms,b:ms 를 읽는다. 이상한 이름은 버리고 최대 30개 */
export function parseRingQuery(params: URLSearchParams, now = Date.now()): { slug: string; since: Date }[] {
  const seen = new Map<string, number>();
  for (const part of (params.get("s") ?? "").split(",")) {
    const i = part.lastIndexOf(":");
    if (i <= 0) continue;
    const ms = Number(part.slice(i + 1));
    if (Number.isFinite(ms) && ms > 0 && ms <= now) seen.set(safeDecode(part.slice(0, i)), ms);
  }
  const out: { slug: string; since: Date }[] = [];
  for (const raw of (params.get("slugs") ?? "").split(",")) {
    const slug = safeDecode(raw);
    if (!SLUG.test(slug) || out.some((o) => o.slug === slug)) continue;
    out.push({ slug, since: new Date(seen.get(slug) ?? now - FIRST_LOOK_MS) });
    if (out.length >= RING_MAX) break;
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}

export const ringOn = (r: Ring | undefined): boolean => !!r && (r.quiz || r.fresh);

/** 색 동그라미 방 먼저, 그 안에서는 원래 순서 그대로 (rings 가 아직 없으면 원래 순서) */
export function ringOrder<T extends { slug: string }>(list: T[], rings: Rings | null): T[] {
  if (!rings) return list;
  return [...list.filter((r) => ringOn(rings[r.slug])), ...list.filter((r) => !ringOn(rings[r.slug]))];
}
