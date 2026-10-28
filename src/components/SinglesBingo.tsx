"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BINGO_CELLS, BINGO_SEEN_KEY, BINGO_SIM_KEY, bingoCandidates, bingoFilled, bingoLines } from "@/lib/singlesBingo";
import { applyDdayLabel, singlesEventPath, type SinglesEvent } from "@/lib/singlesEvents";

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(BINGO_SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** 행사 상세를 연 브라우저에 그 행사를 적어 둔다 (/singles/<번호>) */
export function SinglesSeenMark({ id }: { id: string }) {
  useEffect(() => {
    try {
      const seen = readSeen();
      seen.add(id);
      window.localStorage.setItem(BINGO_SEEN_KEY, JSON.stringify([...seen].slice(-200)));
    } catch {}
  }, [id]);
  return null;
}

export function markSimDone() {
  try {
    window.localStorage.setItem(BINGO_SIM_KEY, "1");
  } catch {}
}

/** 🎯 행사 빙고 (10/28): 조건에 맞는 행사를 열어 보면 칸이 채워진다. 가운데는 💬 썸 시뮬레이터 */
export function SinglesBingo({ events, today }: { events: SinglesEvent[]; today: string }) {
  const [filled, setFilled] = useState<boolean[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    let sim = false;
    try {
      sim = window.localStorage.getItem(BINGO_SIM_KEY) === "1";
    } catch {}
    setFilled(bingoFilled(events, readSeen(), sim, today));
  }, [events, today]);
  if (!events.length) return null;
  const f = filled ?? BINGO_CELLS.map(() => false);
  const count = f.filter(Boolean).length;
  const lines = bingoLines(f);
  const cell = open !== null ? BINGO_CELLS[open]! : null;
  const picks = cell ? bingoCandidates(cell, events, today) : [];
  return (
    <section className="bingo card" aria-label="행사 빙고">
      <div className="bingo-head">
        <strong>🎯 행사 빙고</strong>
        <span className="hint">
          {count}/9칸{lines > 0 && <b className="bingo-done"> · 🎉 빙고 {lines}줄!</b>}
        </span>
      </div>
      <p className="hint bingo-how">칸을 누르고, 조건에 맞는 행사를 열어 보면 칸이 채워져요.</p>
      <div className="bingo-grid">
        {BINGO_CELLS.map((c, i) => (
          <button
            key={c.key}
            type="button"
            className={`bingo-cell${f[i] ? " on" : ""}${open === i ? " sel" : ""}`}
            aria-pressed={open === i}
            aria-label={`${c.label}${f[i] ? ", 채움" : ""}`}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span aria-hidden>{f[i] ? "✅" : c.emoji}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>
      {cell && (
        <div className="bingo-pick">
          {cell.test === null ? (
            <Link href="/some-sim">💬 썸 시뮬레이터 하고 가운데 칸 채우기 →</Link>
          ) : picks.length ? (
            <ul>
              {picks.map((e) => (
                <li key={e.id}>
                  <Link href={singlesEventPath(e.id)}>{e.title}</Link> <span className="hint">· {applyDdayLabel(e, today)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">지금은 이 칸에 맞는 행사가 없어요. 새 행사가 올라오면 채울 수 있어요.</p>
          )}
        </div>
      )}
      {lines > 0 && <p className="bingo-reward">🎉 빙고! 아래 🔔 행사 알림을 켜 두면 새 행사가 올라올 때 바로 알려 드려요.</p>}
    </section>
  );
}
