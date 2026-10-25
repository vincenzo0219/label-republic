/**
 * 이 브라우저에서 열어 본 글 번호 (10/25). localStorage "lr:readPosts" 에만 두고, 리포트를 요청할 때 "새 글"에서 빼려고만 보낸다
 * (서버는 기록하지 않음). 목록에서 스쳐 본 글(lr:seenPosts)이 아니라 글 화면을 연 것만 — 스쳐 본 글까지 빼면
 * 홈에서 본 "새 소식"이 리포트를 열기도 전에 사라진다.
 * React 없이 쓰는 순수 함수라 테스트에서도 import 할 수 있다.
 */
export const READ_POSTS_KEY = "lr:readPosts";
/** 최근에 연 글 이만큼만 (요청 주소 길이) */
export const MAX_READ_POSTS = 200;

type Store = Pick<Storage, "getItem" | "setItem">;

function store(s?: Store | null): Store | null {
  if (s !== undefined) return s;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getReadPosts(s?: Store | null): string[] {
  const st = store(s);
  if (!st) return [];
  try {
    const v: unknown = JSON.parse(st.getItem(READ_POSTS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^\d{1,18}$/.test(x)).slice(-MAX_READ_POSTS) : [];
  } catch {
    return [];
  }
}

/** 끝에 추가 (이미 있으면 끝으로 옮긴다), 오래된 것부터 버린다 */
export function markRead(id: string, s?: Store | null) {
  const st = store(s);
  if (!st || !/^\d{1,18}$/.test(id)) return;
  const next = [...getReadPosts(st).filter((x) => x !== id), id].slice(-MAX_READ_POSTS);
  try {
    st.setItem(READ_POSTS_KEY, JSON.stringify(next));
  } catch {}
}
