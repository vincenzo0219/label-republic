"use client";

import { useEffect, useState } from "react";
import { STAR_KEY } from "@/lib/singlesCalendar";

export function readStars(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(STAR_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function writeStars(s: Set<string>) {
  try {
    window.localStorage.setItem(STAR_KEY, JSON.stringify([...s].slice(-100)));
  } catch {}
}

/** ⭐ 관심 (10/29): 누르면 📅 내 행사 달력 탭에 모인다. 이 브라우저에만 저장 */
export function SinglesStar({ id }: { id: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(readStars().has(id)), [id]);
  const toggle = () => {
    const s = readStars();
    if (s.has(id)) s.delete(id);
    else s.add(id);
    writeStars(s);
    setOn(s.has(id));
  };
  return (
    <button type="button" className={`singles-star${on ? " on" : ""}`} aria-pressed={on} onClick={toggle}>
      {on ? "⭐ 관심 행사" : "☆ 관심"}
    </button>
  );
}
