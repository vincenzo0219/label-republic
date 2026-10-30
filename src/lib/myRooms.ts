/**
 * 내 방 (전용방). 가입 없이 이 브라우저(localStorage "nb:myRooms")에만 저장하는 방 slug 목록, 순서 유지, 최대 8개.
 * 서버가 홈 피드를 내 방 글로만 그릴 수 있게 같은 목록을 쿠키(nb_my)에도 비춰 둔다 (서버는 기록하지 않음).
 *
 * 처음 들어온 방 하나만 자동으로 담고, 그 뒤는 ☆을 눌러야 담긴다. 키가 있으면(빈 목록이라도) 이미 시작한 것으로 본다.
 * 이 파일은 React 없이 쓰는 순수 함수라 서버·테스트에서도 import 할 수 있다.
 */
export const MY_ROOMS_KEY = "nb:myRooms";
export const MY_ROOMS_COOKIE = "nb_my";
export const MY_ROOMS_MAX = 8;
export const MY_ROOMS_EVENT = "nb:myRooms-changed";

type Store = Pick<Storage, "getItem" | "setItem">;

const SLUG_RE = /^[\p{L}\p{N}-]{1,60}$/u;

function clean(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && SLUG_RE.test(x) && !out.includes(x)) out.push(x);
  return out.slice(0, MY_ROOMS_MAX);
}

function store(s?: Store | null): Store | null {
  if (s !== undefined) return s;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** null = 아직 한 번도 저장한 적 없음 (자동 추가 대상), 깨진 값도 null 로 본다 */
function readRaw(s: Store | null): string[] | null {
  if (!s) return null;
  try {
    const raw = s.getItem(MY_ROOMS_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? clean(v) : null;
  } catch {
    return null;
  }
}

export function getMyRooms(s?: Store | null): string[] {
  return readRaw(store(s)) ?? [];
}

function save(list: string[], s: Store | null) {
  const v = clean(list);
  try {
    s?.setItem(MY_ROOMS_KEY, JSON.stringify(v));
  } catch {
    /* 사생활 보호 모드 등: 저장 못 하면 표시만 안 된다 */
  }
  writeMyRoomsCookie(v);
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(MY_ROOMS_EVENT));
  } catch {}
  return v;
}

/** 끝에 추가. 이미 있으면 그대로, 8개가 찼으면 false */
export function addMyRoom(slug: string, s?: Store | null): boolean {
  const st = store(s);
  const cur = getMyRooms(st);
  if (cur.includes(slug)) return true;
  if (cur.length >= MY_ROOMS_MAX || !SLUG_RE.test(slug)) return false;
  save([...cur, slug], st);
  return true;
}

export function removeMyRoom(slug: string, s?: Store | null) {
  const st = store(s);
  save(getMyRooms(st).filter((x) => x !== slug), st);
}

/** 결과: "added" | "removed" | "full" */
export function toggleMyRoom(slug: string, s?: Store | null): "added" | "removed" | "full" {
  const st = store(s);
  if (getMyRooms(st).includes(slug)) {
    removeMyRoom(slug, st);
    return "removed";
  }
  return addMyRoom(slug, st) ? "added" : "full";
}

/** 방에 처음 들어왔을 때: 아직 내 방을 시작한 적이 없을 때만 그 방 하나를 담는다 */
export function autoAddFirstRoom(slug: string, s?: Store | null): boolean {
  const st = store(s);
  if (!st || readRaw(st) !== null || !SLUG_RE.test(slug)) return false;
  save([slug], st);
  return true;
}

/**
 * 내 방 기능 전에 쓰던 값(마지막에 있던 방 쿠키·☆ 관심 방)으로 처음 한 번 채운다. 이미 시작했으면 그대로.
 * 이렇게 해야 예전에 방 2개를 담아 둔 사람이 홈에서 마지막 방으로 튕기지 않는다.
 */
export function seedMyRooms(list: string[], s?: Store | null): boolean {
  const st = store(s);
  const v = clean(list);
  if (!st || readRaw(st) !== null || !v.length) return false;
  save(v, st);
  return true;
}

export function onMyRoomsChange(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => (e.key === null || e.key === MY_ROOMS_KEY) && fn();
  window.addEventListener(MY_ROOMS_EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MY_ROOMS_EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}

// ---------------------------------------------------------------------------
// 쿠키 (서버 렌더용 사본)
// ---------------------------------------------------------------------------
export function myRoomsCookieValue(list: string[]): string {
  return encodeURIComponent(clean(list).join(","));
}

export function writeMyRoomsCookie(list: string[]) {
  try {
    if (typeof document === "undefined") return;
    document.cookie = `${MY_ROOMS_COOKIE}=${myRoomsCookieValue(list)}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}

/** 서버: 쿠키 값 → slug 목록. 쿠키가 없으면 null (내 방을 아직 시작하지 않음) */
export function parseMyRoomsCookie(raw: string | undefined | null): string[] | null {
  if (raw === undefined || raw === null) return null;
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    return [];
  }
  return clean(s.split(",").filter(Boolean));
}

// ---------------------------------------------------------------------------
// 홈 → 내 방 하나로 바로 (방이 정확히 1개일 때)
// ---------------------------------------------------------------------------
/**
 * 바깥에서(주소창·홈 화면 아이콘·외부 링크) 쿼리 없이 홈에 왔을 때만 내 방으로 보낸다.
 * 사이트 안 링크로 온 경우(softNav 또는 같은 사이트 referrer)·?from 등 쿼리가 붙은 경우는 그대로 홈.
 * 예외: 홈 화면 아이콘의 "?source=pwa" 하나만 붙은 경우는 보낸다.
 */
export function homeRedirectTarget(input: { rooms: string[]; search: string; referrer: string; origin: string; softNav: boolean }): string | null {
  if (input.rooms.length !== 1 || input.softNav) return null;
  const q = new URLSearchParams(input.search);
  const keys = [...q.keys()];
  const pwaOnly = keys.length === 1 && keys[0] === "source" && q.get("source") === "pwa";
  if (keys.length && !pwaOnly) return null;
  if (input.referrer) {
    try {
      if (new URL(input.referrer).origin === input.origin) return null;
    } catch {}
  }
  return `/c/${encodeURIComponent(input.rooms[0]!)}`;
}

/**
 * 지나온 경로(NavCounter 가 남김)로 사이트 안 이동인지. 첫 화면이면 비어 있거나 지금 경로 하나뿐이다.
 * NavCounter 의 effect 가 이 판단보다 먼저 돌든 나중에 돌든 같은 답이 나온다.
 */
export function isSoftNav(paths: string[], here: string): boolean {
  if (paths.length >= 2) return true;
  return paths.length === 1 && paths[0] !== here;
}

// ---------------------------------------------------------------------------
// 칩에 쓰는 짧은 이름·이모지
// ---------------------------------------------------------------------------
const EMOJI: Record<string, string> = {
  "게임-덕후방": "🎮",
  "다이어트-식단-함께해요": "🥗",
  "드라마-덕후방": "📺",
  "러닝-덕후방": "🏃",
  "미국주식방": "🇺🇸",
  "반려견-덕후방": "🐶",
  "비건-덕후방": "🌱",
  "비바리움-덕후방": "🦎",
  "신발-덕후방": "👟",
  "애니-만화-덕후방": "🎨",
  "오늘도-장사중": "🏪",
  "와인-위스키-덕후방": "🍷",
  "요가-필라테스-덕후방": "🧘",
  "육아-덕후방": "👶",
  "읽는-책-제목을-교환해-보자": "📚",
  "작가지망생방": "✍️",
  "적립식-투자방": "💰",
  "주식": "📈",
  "커피-덕후방": "☕",
  "ai-덕후방": "🤖",
  "ai-밸런스-토론방": "⚖️",
  "k리그-덕후방": "⚽",
  "kbo-덕후방": "⚾",
  "perfume-audio": "🎧",
  "뮤지컬-연극-덕후방": "🎭",
  "팝업-전시-덕후방": "🛍️",
  "고양이-집사방": "🐱",
  "키덜트-덕후방": "🧸",
  "캠핑-덕후방": "⛺",
  "테니스-덕후방": "🎾",
  "보드게임-방탈출-덕후방": "🎲",
  "필름카메라-덕후방": "📷",
  "미혼남녀-만남-행사": "💌",
  keyboards: "⌨️",
  supplements: "💊",
  "pet-food": "🐾",
};

export function roomEmoji(slug: string): string {
  return EMOJI[slug] ?? "🏠";
}

/** 방 아이콘 바탕색 (SNS 카드와 같은 방 색, 10/30 홈 방 아이콘) */
const COLOR: Record<string, string> = {
  "perfume-audio": "#5fd3ff", "비건-덕후방": "#8fd16a", "비바리움-덕후방": "#7bd88f", "읽는-책-제목을-교환해-보자": "#f2c46d",
  "ai-덕후방": "#b18cff", "k리그-덕후방": "#2f8cff", "반려견-덕후방": "#ffb357", "kbo-덕후방": "#ff6b5f", "애니-만화-덕후방": "#c79bff",
  "러닝-덕후방": "#3ddc97", "요가-필라테스-덕후방": "#ffb3c7", "드라마-덕후방": "#ff7eb6", "신발-덕후방": "#f5a623", "게임-덕후방": "#a3e635",
  "커피-덕후방": "#c08457", "육아-덕후방": "#ffc4a3", "작가지망생방": "#e8d5a3", "주식": "#e05a5a", "미국주식방": "#4a7bd0",
  "적립식-투자방": "#f0b429", "다이어트-식단-함께해요": "#7ccf6b", "요가-필라테스-강사방": "#d98fb0", "오늘도-장사중": "#ff8a3d",
  "고양이-집사방": "#f4a7b9", "캠핑-덕후방": "#8bbf6a", "보드게임-방탈출-덕후방": "#ffcf5c", "키덜트-덕후방": "#7fd4ff",
  "뮤지컬-연극-덕후방": "#d98cff", "팝업-전시-덕후방": "#ff9f68", "필름카메라-덕후방": "#c9b38a", "테니스-덕후방": "#c6f432",
  "미혼남녀-만남-행사": "#ff8fab", "와인-위스키-덕후방": "#b5546a",
};
export function roomColor(slug: string): string {
  return COLOR[slug] ?? "#9aa5b1";
}

const SHORT: Record<string, string> = {
  "반려견-덕후방": "애견",
  "읽는-책-제목을-교환해-보자": "책",
  "다이어트-식단-함께해요": "다이어트",
  "ai-밸런스-토론방": "AI 토론",
  "오늘도-장사중": "장사중",
  "팝업-전시-덕후방": "팝업·전시",
  "고양이-집사방": "고양이",
  "보드게임-방탈출-덕후방": "보드게임",
  "필름카메라-덕후방": "필름카메라",
  "미혼남녀-만남-행사": "미혼남녀 행사",
};

/** 이모지를 따로 붙이는 자리에서 쓰는 이름 — 방 이름이 그 이모지로 시작하면 뗀다 ("🏪 오늘도 장사중" → "오늘도 장사중") */
export function roomPlainName(room: { slug: string; name: string }): string {
  const e = roomEmoji(room.slug);
  return room.name.startsWith(e) ? room.name.slice(e.length).trim() || room.name : room.name;
}

/** "육아 덕후방" → "육아", "미국주식방" → "미국주식", "애니·만화 덕후방" → "애니·만화" */
export function roomShortName(room: { slug: string; name: string }): string {
  if (SHORT[room.slug]) return SHORT[room.slug]!;
  let n = room.name.trim().replace(/[.!~]+$/, "");
  n = n.replace(/\s*덕후방$/, "").replace(/(.{2,})방$/, "$1");
  if ([...n].length > 8) n = n.split(/\s+/)[0]!;
  return n || room.name;
}
