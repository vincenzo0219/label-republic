"use client";

/**
 * 🆕 내 방 새 글 알림 (10/25). 내 방(nb:myRooms)은 브라우저에만 있어서, 이 알림을 켠 브라우저만 내 방 목록을 서버 구독에 보낸다.
 * 켜기는 버튼을 눌렀을 때만 (권한 창을 먼저 띄우지 않는다). 푸시 알림을 끄면(PushSettings) 서버 구독과 함께 지워진다.
 */
import { getMyRooms } from "./myRooms";
import { enablePush, pushGranted } from "./pushClient";
import { getPushState } from "./watchlist";

const KEY = "lr:roomAlerts";
export const ROOM_ALERTS_EVENT = "lr:roomAlerts-changed";

export function roomAlertsOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1" && !!getPushState() && pushGranted();
  } catch {
    return false;
  }
}

function setFlag(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {}
  try {
    window.dispatchEvent(new Event(ROOM_ALERTS_EVENT));
  } catch {}
}

async function post(on: boolean): Promise<boolean> {
  const s = getPushState();
  if (!s) return false;
  const res = await fetch("/api/push/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: s.endpoint, token: s.token, on, rooms: on ? getMyRooms() : [] }),
  });
  // 서버에 구독이 없어졌으면(푸시를 끔) 이쪽 표시도 끈다
  if (res.status === 403 || res.status === 404) setFlag(false);
  return res.ok;
}

/** 버튼을 눌렀을 때: 푸시가 아직 꺼져 있으면 권한부터 받고, 내 방 목록과 함께 켠다 */
export async function enableRoomAlerts(publicKey: string): Promise<"on" | NotificationPermission | "failed"> {
  if (!getPushState() || !pushGranted()) {
    const r = await enablePush(publicKey);
    if (r !== "on") return r;
  }
  if (!(await post(true))) return "failed";
  setFlag(true);
  return "on";
}

export async function disableRoomAlerts(): Promise<void> {
  try {
    await post(false);
  } catch {}
  setFlag(false);
}

/** 푸시 알림을 통째로 껐을 때 (서버 구독이 지워짐) */
export function clearRoomAlertsFlag() {
  setFlag(false);
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** ☆ 내 방 추가·빼기 뒤: 알림을 켠 브라우저면 서버의 방 목록을 맞춘다 (잠깐 모았다가 한 번) */
export function scheduleRoomAlertsSync() {
  if (!roomAlertsOn()) return;
  clearTimeout(timer);
  timer = setTimeout(() => void post(true).catch(() => {}), 800);
}
