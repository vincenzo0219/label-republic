/**
 * 🙋 같이 갈 사람 (10/26): 이 브라우저가 가진 증표. 조·모집 채팅 증표(번호.증표)와 조 신청 증표는 localStorage 에만.
 * 다른 기기에서는 닉네임 + PIN 으로 다시 받는다.
 */
const GROUPS = "lr:eventGroups";
const POOL = "lr:eventPool";

function readMap(key: string): Record<string, string> {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function writeMap(key: string, m: Record<string, string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(m));
  } catch {}
}

export const groupTokens = () => readMap(GROUPS);
export function setGroupToken(groupId: string, token: string | null) {
  const m = readMap(GROUPS);
  if (token) m[groupId] = token;
  else delete m[groupId];
  writeMap(GROUPS, m);
  try {
    window.dispatchEvent(new Event(GROUPS_EVENT));
  } catch {}
}
export const GROUPS_EVENT = "lr:eventGroups";
export const poolRef = (postId: string): string | null => readMap(POOL)[postId] ?? null;
export function setPoolRef(postId: string, ref: string | null) {
  const m = readMap(POOL);
  if (ref) m[postId] = ref;
  else delete m[postId];
  writeMap(POOL, m);
}
export function savedNickname(): string {
  try {
    return window.localStorage.getItem("lr:nickname") ?? "";
  } catch {
    return "";
  }
}
