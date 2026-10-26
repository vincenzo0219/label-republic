/** 🚫 차단 (10/26): 이 기기에서만 그 닉네임의 댓글·채팅·조 채팅을 숨긴다. 로그인이 없어서 서버가 아니라 이 브라우저에 둔다 */
const KEY = "lr:blocked";

export function blockedNicknames(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function blockNickname(name: string): void {
  try {
    const list = blockedNicknames().filter((n) => n !== name);
    localStorage.setItem(KEY, JSON.stringify([name, ...list].slice(0, 200)));
  } catch {}
}

export function unblockNickname(name: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(blockedNicknames().filter((n) => n !== name)));
  } catch {}
}
