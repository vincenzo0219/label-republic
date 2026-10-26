"use client";

import { useEffect, useState } from "react";
import { getMyRooms } from "@/lib/myRooms";
import { CAL_MAX_ROOMS, calendarLinks } from "@/lib/roomCalendar";

/**
 * 📅 내 폰 달력에 추가 (10/26) — 🎫 행사 탭과 홈 "이번 주 내 방 행사". 누르면 iPhone·구글 달력 구독 링크와 주소 복사.
 * room: 지금 방 (내 방 목록 앞에 붙인다). rooms: 서버가 아는 내 방 (홈). 둘 다 없으면 브라우저의 내 방 목록.
 */
export function CalendarSubscribe({ room, rooms, compact = false }: { room?: string; rooms?: string[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [list, setList] = useState<string[]>(() => uniq([...(room ? [room] : []), ...(rooms ?? [])]));
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (rooms) return;
    // 내 방은 이 브라우저에만 있다 (getMyRooms 는 저장소를 못 읽으면 빈 목록)
    setList(uniq([...(room ? [room] : []), ...getMyRooms()]));
  }, [room, rooms]);

  if (!list.length) return null;
  const links = origin ? calendarLinks(origin, list) : null;

  const copy = async () => {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.https);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  return (
    <div className={`cal-sub${compact ? " compact" : ""}`}>
      <button type="button" className={compact ? "cal-sub-toggle" : "btn event-alert"} onClick={() => setOpen(!open)} aria-expanded={open}>
        📅 내 폰 달력에 추가
      </button>
      {open && links && (
        <div className="cal-sub-panel">
          <p>새 행사가 올라오면 달력에 자동으로 들어오고, 전날 아침 9시에 폰이 알려 줘요.</p>
          <p className="hint">{list.length === 1 ? "이 방" : `방 ${list.length}곳`}의 🎫 행사·🎁 혜택 날짜가 들어가요.</p>
          <div className="cal-sub-actions">
            <a className="btn btn-sm" href={links.webcal}>🍎 iPhone·Mac 달력</a>
            <a className="btn btn-sm" href={links.google} target="_blank" rel="noopener">📆 구글 캘린더</a>
            <button type="button" className="btn btn-sm" onClick={copy}>🔗 주소 복사</button>
          </div>
          {copied === "ok" && <p className="hint">복사했어요. 달력 앱의 &ldquo;구독 추가&rdquo;나 &ldquo;URL로 추가&rdquo;에 붙여 넣어 주세요.</p>}
          {copied === "fail" && <input className="cal-sub-url" readOnly value={links.https} onFocus={(e) => e.currentTarget.select()} aria-label="달력 구독 주소" />}
          <p className="hint">날짜는 글에서 자동으로 읽어요. 최종 기준은 원문 공지예요. 구글 캘린더는 알림 시각을 달력 설정에서 정해요.</p>
        </div>
      )}
    </div>
  );
}

const uniq = (xs: string[]) => [...new Set(xs)].slice(0, CAL_MAX_ROOMS);
