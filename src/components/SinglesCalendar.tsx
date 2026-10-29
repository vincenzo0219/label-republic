"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ddayText, sortStarred, starIcs } from "@/lib/singlesCalendar";
import { SINGLES_PATH, applyDdayLabel, singlesEventPath, type SinglesEvent } from "@/lib/singlesEvents";
import { readStars, SinglesStar } from "./SinglesStar";

/** 📅 내 행사 달력 탭 (10/29): ⭐ 관심 행사를 다음 날짜 순으로 */
export function SinglesCalendar({ events, today }: { events: SinglesEvent[]; today: string }) {
  const [stars, setStars] = useState<Set<string> | null>(null);
  useEffect(() => setStars(readStars()), []);
  if (!stars) return <p className="hint">불러오는 중…</p>;
  const list = sortStarred(events, stars, today);
  const download = () => {
    const ics = starIcs(list.map((x) => x.event), today, window.location.origin);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "nobangjang-singles.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  if (!list.length)
    return (
      <div className="empty">
        아직 관심 행사가 없어요. 💌 만남 행사 카드의 ☆ 관심을 누르면 여기에 접수 마감·행사일이 모여요.
        <br />
        <Link className="btn btn-sm" style={{ marginTop: 12 }} href={SINGLES_PATH}>
          💌 만남 행사 보러 가기
        </Link>
      </div>
    );
  return (
    <section className="singles-cal" aria-label="내 행사 달력">
      <p className="hint">관심 표시는 이 브라우저에만 저장돼요.</p>
      <ul className="singles-cal-list">
        {list.map(({ event: e, next }) => (
          <li key={e.id} className="singles-cal-item">
            <div className="singles-cal-head">
              <Link href={singlesEventPath(e.id)}>{e.title}</Link>
              <SinglesStar id={e.id} />
            </div>
            {next.length ? (
              <p className="singles-cal-dates">
                {next.map((k) => (
                  <span key={k.label} className={`singles-cal-date${k.dday <= 3 ? " soon" : ""}`}>
                    {k.label} {k.date.slice(5).replace("-", "/")} · {ddayText(k.dday)}
                  </span>
                ))}
              </p>
            ) : (
              <p className="hint">{applyDdayLabel(e, today)}</p>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={download}>
        📲 내 폰 달력에 추가 (.ics)
      </button>
    </section>
  );
}
