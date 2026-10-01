"use client";

/**
 * 내가 요청하거나 동의한 방 개설 요청 (론칭 검수). 이 브라우저에만 저장한다 — 서버의 동의 기록은 IP·브라우저
 * 지문이라 "내가 동의했는지"를 화면에 다시 보여줄 수 없어서, 여기 남겨 두고
 * 1) 다시 들어와도 "동의함"으로 보이게, 2) 방이 열리면 홈에서 한 번 알려 주는 데 쓴다.
 */
const KEY = "lr_room_reqs_v1";
const MAX = 30;

export type MyRoomRequest = { name: string; at: number; /** 열린 걸 알려 줬으면 true */ told?: boolean };
type Store = Record<string, MyRoomRequest>;

function load(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return raw && typeof raw === "object" ? (raw as Store) : {};
  } catch {
    return {};
  }
}

function save(s: Store) {
  try {
    const entries = Object.entries(s).sort((a, b) => b[1].at - a[1].at).slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* 저장 불가면 알림만 못 받는다 */
  }
}

export function myRoomRequests(): Store {
  return load();
}

export function rememberRoomRequest(id: string, name: string) {
  const s = load();
  if (!s[id]) s[id] = { name, at: Date.now() };
  save(s);
}

export function markRoomRequestTold(ids: string[]) {
  const s = load();
  for (const id of ids) if (s[id]) s[id]!.told = true;
  save(s);
}

/** 아직 열렸다고 알려 주지 않은 요청이 있나 — 없으면 서버에 묻지도 않는다 */
export function hasUntoldRoomRequests(): boolean {
  return Object.values(load()).some((r) => !r.told);
}
