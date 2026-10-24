"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getInterests, setInterests } from "@/lib/interests";
import {
  autoAddFirstRoom,
  getMyRooms,
  homeRedirectTarget,
  isSoftNav,
  MY_ROOMS_KEY,
  onMyRoomsChange,
  roomEmoji,
  roomShortName,
  seedMyRooms,
  toggleMyRoom,
  writeMyRoomsCookie,
} from "@/lib/myRooms";

let cache: { key: string; list: string[] } = { key: "", list: [] };
function snapshot(): string[] {
  const list = getMyRooms();
  const key = list.join(",");
  if (key !== cache.key) cache = { key, list };
  return cache.list;
}

/** 내 방 목록 (서버 렌더·하이드레이션 중에는 null) */
export function useMyRooms(): string[] | null {
  return useSyncExternalStore(onMyRoomsChange, snapshot, () => null);
}

// 이 탭에서 지나온 경로 (클라이언트 내비게이션). 하이드레이션 순서와 상관없이 판단하려고 횟수 대신 경로를 남긴다
const paths: string[] = [];
/** 루트 레이아웃에 하나 */
export function NavCounter() {
  const path = usePathname();
  useEffect(() => {
    if (paths.at(-1) !== path) paths.push(path);
  }, [path]);
  return null;
}

/** /c/<slug> 아래 어디든, 글 페이지: 내 방이 아직 없으면 이 방을 첫 내 방으로 */
export function AutoMyRoom({ slug }: { slug: string }) {
  useEffect(() => {
    autoAddFirstRoom(slug);
  }, [slug]);
  return null;
}

function syncInterest(slug: string, on: boolean) {
  const cur = getInterests();
  if (on && !cur.includes(slug)) setInterests([...cur, slug]);
  if (!on && cur.includes(slug)) setInterests(cur.filter((s) => s !== slug));
}

/** 방 이름 옆 ☆/★ */
export function MyRoomStar({ slug }: { slug: string }) {
  const mine = useMyRooms();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const on = !!mine?.includes(slug);
  const click = () => {
    const r = toggleMyRoom(slug);
    if (r !== "full") syncInterest(slug, r === "added");
    setToast(r === "added" ? "내 방에 추가했어요" : r === "removed" ? "뺐어요" : "8개까지예요");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 1500);
  };
  return (
    <>
      <button type="button" className="my-star" aria-pressed={on} aria-label={on ? "내 방에서 빼기" : "내 방에 추가"} onClick={click} disabled={mine === null}>
        {on ? "★" : "☆"}
      </button>
      {toast && (
        <span className="nb-toast" role="status">
          {toast}
        </span>
      )}
    </>
  );
}

type Room = { slug: string; name: string };

/**
 * 홈 맨 위 내 방 칩 + "＋ 방 더 보기"(전체 방 목록, 내 방 ★ 먼저).
 * initial: 서버가 쿠키로 본 목록 (없으면 null). 브라우저 목록과 다르면 쿠키를 맞추고 화면을 새로 그린다.
 * redirect: 방이 하나뿐이고 바깥에서 쿼리 없이 왔으면 그 방으로.
 */
export function MyRoomsBar({ rooms, initial, legacy, filtered, redirect }: { rooms: Room[]; initial: string[] | null; legacy: string | null; filtered: boolean; redirect: boolean }) {
  const router = useRouter();
  const live = useMyRooms();
  const [open, setOpen] = useState(false);
  const mine = live ?? initial ?? [];

  // 처음 그려질 때 사이트 안 이동으로 왔는지 기억
  const soft = useRef<boolean | null>(null);
  const decided = useRef(false);
  useEffect(() => {
    if (soft.current === null) soft.current = isSoftNav(paths, location.pathname);
    if (live === null) return;
    let has = false;
    try {
      has = window.localStorage.getItem(MY_ROOMS_KEY) !== null;
    } catch {
      return; // 저장소를 못 쓰면 쿠키를 그대로 둔다
    }
    // 예전 값(마지막 방 쿠키 + 관심 방)으로 처음 한 번 채우면 목록이 바뀌어 이 effect 가 다시 돈다
    if (!has && seedMyRooms([...(legacy ? [legacy] : []), ...getInterests()])) return;
    if (redirect && !decided.current) {
      decided.current = true;
      const to = homeRedirectTarget({ rooms: live, search: location.search, referrer: document.referrer, origin: location.origin, softNav: soft.current });
      if (to) return router.replace(to);
    }
    if ((has || initial !== null) && live.join(",") !== (initial ?? []).join(",")) {
      writeMyRoomsCookie(live);
      router.refresh();
    }
  }, [live, initial, legacy, redirect, router]);

  const byslug = new Map(rooms.map((r) => [r.slug, r]));
  const my = mine.map((s) => byslug.get(s)).filter((r): r is Room => !!r);
  if (!my.length) return null;
  const sorted = [...my, ...rooms.filter((r) => !mine.includes(r.slug))];
  return (
    <>
      <nav className="my-rooms" aria-label="내 방">
        {my.map((r) => (
          <Link key={r.slug} href={`/c/${encodeURIComponent(r.slug)}`} className="my-chip">
            <span aria-hidden>{roomEmoji(r.slug)}</span> {roomShortName(r)}
          </Link>
        ))}
        <button type="button" className="my-chip my-chip-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          ＋ 방 더 보기
        </button>
      </nav>
      {open && (
        <ul className="my-room-list" aria-label="전체 방">
          {sorted.map((r) => (
            <li key={r.slug}>
              <Link href={`/c/${encodeURIComponent(r.slug)}`}>
                <span aria-hidden>{roomEmoji(r.slug)}</span> {r.name}
                {mine.includes(r.slug) && <span className="my-mark" aria-label="내 방"> ★</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {filtered && (
        <p className="my-all">
          <Link href="/?all=1">전체 방 글 보기</Link>
        </p>
      )}
    </>
  );
}
