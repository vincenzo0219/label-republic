"use client";

/**
 * "새 글" 표시 (Sprint 41). 방마다 마지막으로 본 시각을 이 브라우저에만 저장한다 — 서버에는 보내지 않는다
 * (새 글 수를 셀 때 방 이름과 시각만 요청에 담고, 서버는 기록하지 않는다).
 *
 * 들어오면 바로 지금 시각으로 기록하되, 들어오기 전 시각은 30분 동안 기억해 둔다(snapshot) — 글을 읽고
 * 목록으로 돌아와도 같은 글에 "NEW"가 남아 있고, 30분 넘게 지나 다시 오면 그때부터 새로 센다.
 */
const KEY = "lr_seen_v1";
const MAX_ROOMS = 60;

type SeenMap = Record<string, number>;

function load(): SeenMap {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return raw && typeof raw === "object" ? (raw as SeenMap) : {};
  } catch {
    return {};
  }
}

function save(m: SeenMap) {
  try {
    const entries = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, MAX_ROOMS);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* 저장 불가(사생활 보호 모드 등)면 표시만 안 한다 */
  }
}

export function readSeenAll(): SeenMap {
  return load();
}

const SESSION_MS = 30 * 60_000;
const SNAP_KEY = "lr_seen_snap_v1";
type Snap = Record<string, { taken: number; v: number | null }>;

// 새로고침해도 30분 동안은 같은 기준을 쓰도록 탭 단위 저장소(sessionStorage)에 둔다
function loadSnap(): Snap {
  try {
    return (JSON.parse(sessionStorage.getItem(SNAP_KEY) ?? "{}") as Snap) ?? {};
  } catch {
    return {};
  }
}

/** 이번 방문 전에 마지막으로 본 시각 (처음 오는 방이면 null — 전부 "새 글"로 보이지 않게) */
export function seenBefore(room: string, now = Date.now()): number | null {
  const snap = loadSnap();
  const s = snap[room];
  if (s && now - s.taken < SESSION_MS) return s.v;
  const v = load()[room] ?? null;
  snap[room] = { taken: now, v };
  try {
    sessionStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  } catch {
    /* 무시 */
  }
  return v;
}

export function markSeen(room: string, at = Date.now()) {
  const m = load();
  m[room] = at;
  save(m);
}
