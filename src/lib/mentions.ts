/**
 * 댓글 본문의 @닉네임 (Sprint 30). 서버(멘션 → 댓글 번호)와 화면(강조 표시)이 같은 규칙으로 찾는다.
 *
 * 닉네임에 공백·특수문자가 들어갈 수 있어 정규식으로 끝을 정할 수 없으므로, 이 글에 실제로 있는 닉네임과만 맞춘다
 * (긴 닉네임부터 — "@홍길동님" 은 "홍길동님"이 없으면 "홍길동"). "a@b.com" 처럼 글자 바로 뒤의 @ 는 멘션이 아니다.
 */

export const MAX_MENTIONED_NICKNAMES = 3;
export const MAX_MENTION_IDS = 10;

const key = (s: string) => s.toLowerCase();

type Hit = { start: number; end: number; nickname: string };

function scan(body: string, nicknames: string[]): Hit[] {
  const names = [...new Map(nicknames.filter((n) => n.length >= 2).map((n) => [key(n), n])).values()].sort((a, b) => b.length - a.length);
  if (!names.length || !body.includes("@")) return [];
  const hits: Hit[] = [];
  for (let i = body.indexOf("@"); i !== -1; i = body.indexOf("@", i + 1)) {
    if (i > 0 && /[\p{L}\p{N}_.]/u.test(body[i - 1]!)) continue;
    // 원문 위치 그대로 비교 (소문자로 바꾼 본문은 길이가 달라질 수 있음)
    const n = names.find((name) => key(body.slice(i + 1, i + 1 + name.length)) === key(name));
    if (n) {
      hits.push({ start: i, end: i + 1 + n.length, nickname: n });
      i += n.length;
    }
  }
  return hits;
}

/** 본문에서 멘션한 닉네임 (나온 순서, 중복 없이, 최대 3명) */
export function extractMentions(body: string, nicknames: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of scan(body, nicknames)) {
    if (seen.has(key(h.nickname))) continue;
    seen.add(key(h.nickname));
    out.push(h.nickname);
    if (out.length >= MAX_MENTIONED_NICKNAMES) break;
  }
  return out;
}

/** 화면 표시용: 본문을 일반 글자와 멘션으로 나눈다 */
export function splitMentions(body: string, nicknames: string[]): { text: string; mention?: boolean }[] {
  const parts: { text: string; mention?: boolean }[] = [];
  let at = 0;
  for (const h of scan(body, nicknames)) {
    if (h.start > at) parts.push({ text: body.slice(at, h.start) });
    parts.push({ text: body.slice(h.start, h.end), mention: true });
    at = h.end;
  }
  if (at < body.length) parts.push({ text: body.slice(at) });
  return parts;
}

/**
 * 멘션한 닉네임 → 알림 받을 댓글 번호. 닉네임마다 그 닉네임의 최근 댓글부터, 전체 최대 10개.
 * 쓰는 사람 본인의 댓글·AI 큐레이터 댓글·답글 대상(이미 답글로 알림)은 뺀다.
 */
export function resolveMentions(
  nicknames: string[],
  thread: { id: string; nickname: string; mine: boolean; ai: boolean }[],
  exclude: string | null,
): string[] {
  const ids: string[] = [];
  const newest = [...thread].sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)));
  for (const n of nicknames) {
    for (const c of newest) {
      if (ids.length >= MAX_MENTION_IDS) return ids;
      if (key(c.nickname) !== key(n) || c.mine || c.ai || c.id === exclude || ids.includes(c.id)) continue;
      ids.push(c.id);
    }
  }
  return ids;
}
