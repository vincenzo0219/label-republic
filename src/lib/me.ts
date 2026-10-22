/**
 * 가입 없이 "나" (Sprint 96): 닉네임은 처음 한 번만 받고, 비밀번호 4자리는 이 브라우저가 알아서 만들어 기억한다.
 * 글·댓글 수정·삭제도 이 번호로 먼저 해 보고, 안 맞을 때만(예전에 직접 정한 번호) 물어본다.
 */
const NICK = "lr:nickname";
const PIN = "lr:pin";

export function myNick(): string {
  try {
    return window.localStorage.getItem(NICK)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveNick(n: string) {
  try {
    if (n.trim()) window.localStorage.setItem(NICK, n.trim());
  } catch {}
}

export function myPin(): string {
  try {
    const ls = window.localStorage;
    let pin = ls.getItem(PIN) ?? ls.getItem("lr:chatPin");
    if (!pin || !/^\d{4}$/.test(pin)) pin = String(Math.floor(1000 + Math.random() * 9000));
    ls.setItem(PIN, pin);
    return pin;
  } catch {
    return String(Math.floor(1000 + Math.random() * 9000));
  }
}

/** 기억한 번호로 먼저, 거절되면 한 번 물어본다. 취소하면 null */
export async function withMyPin<T>(run: (pw: string) => Promise<T>, ask: string): Promise<T | null> {
  try {
    return await run(myPin());
  } catch (err) {
    if ((err as { status?: number }).status !== 403) throw err;
    const pw = window.prompt(ask);
    if (pw === null) return null;
    return run(pw);
  }
}

/** 비밀번호를 바꾸면 이 브라우저가 기억하는 번호도 바꾼다 (마이페이지, 10/22) */
export function setMyPin(pin: string) {
  try {
    if (/^\d{4}$/.test(pin)) window.localStorage.setItem(PIN, pin);
  } catch {}
}

const POSTS = "lr:myPosts";
/** 내가 쓴 글 번호 — 마이페이지 "내 글" (서버는 저장하지 않는다) */
export function myPostIds(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(POSTS) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^\d{1,18}$/.test(x)) : [];
  } catch {
    return [];
  }
}

export function addMyPost(id: string) {
  try {
    const cur = myPostIds();
    if (!cur.includes(id)) window.localStorage.setItem(POSTS, JSON.stringify([...cur, id].slice(-100)));
  } catch {}
}
