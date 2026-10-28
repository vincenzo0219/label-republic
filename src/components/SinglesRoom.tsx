"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clearSinglesProfile, loadSinglesProfile, saveSinglesProfile } from "@/lib/singlesClient";
import {
  checkEligibility,
  eventStatus,
  nextAfterRejection,
  singlesEventPath,
  sortForList,
  applyDdayLabel,
  type SinglesEvent,
  type SinglesProfile,
} from "@/lib/singlesEvents";
import type { SinglesTalk } from "@/lib/repo/singlesTalk";
import { SeenTracker } from "./SeenTracker";
import { SinglesAlert } from "./SinglesAlert";
import { SinglesChecker } from "./SinglesChecker";
import { SinglesEventCard } from "./SinglesEventCard";

export const hasInput = (p: SinglesProfile) => !!(p.birthYear || p.gender || p.live || p.work || typeof p.firstMarriage === "boolean");

/** 브라우저에 저장된 입력값 (처음 그릴 때는 비어 있다가 읽어 온다) */
export function useSinglesProfile(today: string) {
  const [profile, setProfile] = useState<SinglesProfile>({});
  useEffect(() => setProfile(loadSinglesProfile(today)), [today]);
  const update = (p: SinglesProfile) => {
    setProfile(p);
    saveSinglesProfile(p);
  };
  const clear = () => {
    setProfile({});
    clearSinglesProfile();
  };
  return { profile, update, clear };
}

/** 😢 떨어졌어요 → 가까운 지역의 다음 행사 (모집 중·예정, 불가 아닌 것) */
export function SinglesRejected({ event, events, profile, today }: { event: SinglesEvent; events: readonly SinglesEvent[]; profile: SinglesProfile; today: string }) {
  const [open, setOpen] = useState(false);
  const next = useMemo(() => (open ? nextAfterRejection(events, event, profile, today) : []), [open, events, event, profile, today]);
  return (
    <div className="singles-rejected">
      <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        😢 떨어졌어요
      </button>
      {open && (
        <div className="singles-next">
          {next.length === 0 ? (
            <p className="hint">지금 모집 중이거나 예정인 다른 행사가 없어요. 알림을 켜 두면 새 행사가 열릴 때 알려 드려요.</p>
          ) : (
            <>
              <p className="hint">가까운 지역의 다음 행사</p>
              <ul>
                {next.map((n) => (
                  <li key={n.id}>
                    <Link href={singlesEventPath(n.id)}>{n.title}</Link> <span className="hint">{[n.sido, n.sigungu].filter(Boolean).join(" ")} · {applyDdayLabel(n, today)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Tab = "open" | "upcoming" | "past";
const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "모집 중" },
  { key: "upcoming", label: "모집 예정" },
  { key: "past", label: "지난 행사" },
];

/** 💌 방 화면: 나 신청 가능? · 탭(모집 중·예정·지난) · 카드 · 알림. 글·댓글·💬 채팅은 방의 다른 탭 (098) */
/** 👁 본 사람 · 💬 댓글 (10/27): 상세 화면 댓글로 */
export function SinglesTalkLine({ eventId, talk }: { eventId: string; talk?: SinglesTalk }) {
  if (!talk) return null;
  return (
    <p className="singles-talk-line">
      <span aria-label={`${talk.views}명 봤어요`}>👁 {talk.views.toLocaleString("ko-KR")}</span>
      <Link href={`${singlesEventPath(eventId)}#talk`} aria-label={`댓글 ${talk.comments}개`}>💬 {talk.comments.toLocaleString("ko-KR")}</Link>
    </p>
  );
}

export function SinglesRoom({ events, today, talks = {} }: { events: SinglesEvent[]; today: string; talks?: Record<string, SinglesTalk> }) {
  const { profile, update, clear } = useSinglesProfile(today);
  const [tab, setTab] = useState<Tab>("open");
  const sorted = useMemo(() => sortForList(events, today), [events, today]);
  const inTab = (e: SinglesEvent, t: Tab) => {
    const st = eventStatus(e, today);
    return t === "open" ? st === "open" : t === "upcoming" ? st === "upcoming" : st === "closed" || st === "ended";
  };
  const counts = Object.fromEntries(TABS.map((t) => [t.key, sorted.filter((e) => inTab(e, t.key)).length])) as Record<Tab, number>;
  const shown = sorted.filter((e) => inTab(e, tab));
  const judged = hasInput(profile);
  return (
    <>
      {/* 💬 썸 시뮬레이터 (10/28): 행사만 보고 나가지 않게, 맨 위에 혼자 해 보는 1~2분 체험 */}
      <Link href="/some-sim" className="ear-banner sim-banner">
        <span aria-hidden>💬</span>
        <span>
          <b>썸 시뮬레이터: 3일간의 카톡</b>
          <br />
          솔로인 지금, 다음 썸에서 나는? 답장만 고르면 나오는 썸 날씨 ☀️🌧🌫🌪
        </span>
      </Link>
      <SinglesChecker profile={profile} onChange={update} onClear={clear} thisYear={Number(today.slice(0, 4))} />
      <nav className="type-filter" aria-label="모집 상태">
        {TABS.map((t) => (
          <button key={t.key} type="button" className="linkish-tab" aria-current={tab === t.key ? "true" : undefined} onClick={() => setTab(t.key)}>
            {t.label} {counts[t.key]}
          </button>
        ))}
      </nav>
      {shown.length === 0 ? (
        <p className="empty">{events.length === 0 ? "아직 모은 행사가 없어요. 원문 공지를 확인하는 대로 올려요." : "이 칸에 맞는 행사가 없어요."}</p>
      ) : (
        <div className="singles-list">
          {shown.map((e) => (
            <div key={e.id} data-post-id={talks[e.id]?.postId}>
              <SinglesEventCard event={e} today={today} eligibility={judged ? checkEligibility(e, profile, today) : null}>
                {tab !== "past" && <SinglesRejected event={e} events={events} profile={profile} today={today} />}
                <SinglesTalkLine eventId={e.id} talk={talks[e.id]} />
              </SinglesEventCard>
            </div>
          ))}
          <SeenTracker key={tab} />
        </div>
      )}
      <SinglesAlert profile={profile} />
    </>
  );
}

/** 상세 화면: 카드(내 조건 판정 포함) + 떨어졌어요 */
export function SinglesDetail({ event, events, today }: { event: SinglesEvent; events: SinglesEvent[]; today: string }) {
  const { profile } = useSinglesProfile(today);
  const judged = hasInput(profile);
  return (
    <SinglesEventCard event={event} today={today} eligibility={judged ? checkEligibility(event, profile, today) : null} link={false}>
      {!judged && <p className="hint">방에서 출생연도·성별·지역을 넣으면 신청 가능 여부를 함께 보여 드려요.</p>}
      <SinglesRejected event={event} events={events} profile={profile} today={today} />
    </SinglesEventCard>
  );
}
