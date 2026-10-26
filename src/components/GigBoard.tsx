"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CLASS_TYPES,
  GIG_GUIDE,
  GOALS,
  JOB_GUIDE,
  JOB_TYPES,
  JOB_TYPE_KEYS,
  LESSON_NOTICE,
  LESSON_SAFETY,
  LEVELS,
  REGIONS,
  TIME_BANDS,
  areasLabel,
  districtsOf,
  jobPayLabel,
  payLabel,
  weekdayLabel,
  whenLabel,
  type GigKind,
} from "@/lib/instructorRoom";
import type { GigCard } from "@/lib/repo/gigs";
import { GigAlert } from "./GigAlert";

type Filter = { sido: string; sigungu: string; when: "" | "today" | "week"; classType: string; jobType: string; beginner: "" | "1"; band: string };
const EMPTY: Filter = { sido: "", sigungu: "", when: "", classType: "", jobType: "", beginner: "", band: "" };
const keyOf = (kind: GigKind) => (kind === "sub" ? "lr:gigFilter" : `lr:gigFilter:${kind}`);

function readFilter(kind: GigKind): Filter {
  try {
    const v = JSON.parse(window.localStorage.getItem(keyOf(kind)) ?? "null") as Partial<Filter> | null;
    return { ...EMPTY, ...(v ?? {}) };
  } catch {
    return EMPTY;
  }
}

/** 요일·시간대 한 줄: "매주 월·수 · 오전·저녁" */
const scheduleLabel = (g: Pick<GigCard, "weekdays" | "timeBands">) =>
  [g.weekdays.length ? `매주 ${weekdayLabel(g.weekdays)}` : "", g.timeBands.join("·")].filter(Boolean).join(" · ") || "요일 협의";

/** 카드: 연락처 없이 */
export function GigCardView({ g }: { g: GigCard }) {
  if (g.kind === "ask")
    return (
      <Link href={`/gigs/${g.id}`} className="kids-card gig-card">
        <div className="kids-chips">
          <span className="kids-chip kind">🙋 레슨 구해요</span>
          {g.goal && <span className="kids-chip">{GOALS[g.goal]}</span>}
          {g.level && <span className="kids-chip">{LEVELS[g.level]}</span>}
          <span className="kids-chip free">{g.pay ? jobPayLabel({ pay: g.pay, payMax: g.payMax, payBase: null }).replace(/^회당/, "희망") : "금액 협의"}</span>
        </div>
        <span className="kids-name">{scheduleLabel(g)}</span>
        <span className="kids-where">{[areasLabel(g.areas), g.classType === "기타" ? "" : g.classType].filter(Boolean).join(" · ")}</span>
      </Link>
    );
  if (g.kind === "job") {
    const lesson = g.jobType === "lesson";
    return (
      <Link href={`/gigs/${g.id}`} className="kids-card gig-card">
        <div className="kids-chips">
          <span className={`kids-chip ${g.jobType === "seek" || lesson ? "kind" : "st-soon"}`}>{g.jobType ? JOB_TYPES[g.jobType] : "구인"}</span>
          <span className="kids-chip">{g.classType}</span>
          <span className="kids-chip free">{jobPayLabel(g)}</span>
          {g.beginnerOk && <span className="kids-chip st-open">초보 가능</span>}
        </div>
        <span className="kids-name">{scheduleLabel(g)}</span>
        <span className="kids-where">{[lesson ? areasLabel(g.areas) : g.sigungu || g.sido, g.studio].filter(Boolean).join(" · ")}</span>
      </Link>
    );
  }
  const place = [g.sigungu || g.sido, g.station && `${g.station}역`].filter(Boolean).join(" · ");
  return (
    <Link href={`/gigs/${g.id}`} className="kids-card gig-card">
      <div className="kids-chips">
        {g.urgent ? <span className="kids-chip st-open">🔥 오늘 급구</span> : <span className="kids-chip kind">대강</span>}
        <span className="kids-chip">{g.classType}</span>
        {g.pay ? <span className="kids-chip free">{payLabel(g.pay)}</span> : null}
      </div>
      <span className="kids-name">{whenLabel(g)}{g.times.length ? ` · ${g.times.slice(0, 4).join(", ")}${g.times.length > 4 ? "…" : ""}` : ""}</span>
      <span className="kids-where">{[place, g.studio].filter(Boolean).join(" · ")}</span>
    </Link>
  );
}

/** 레슨 글 고정 안내 (폼·목록·글) */
export function LessonNotice() {
  return (
    <div className="hint gig-lesson-notice" role="note">
      <p>{LESSON_NOTICE}</p>
      <p>{LESSON_SAFETY}</p>
    </div>
  );
}

const COPY: Record<GigKind, { aria: string; write: string; empty: string }> = {
  sub: { aria: "대강", write: "✍️ 대강 올리기", empty: "조건에 맞는 대강이 아직 없어요" },
  job: { aria: "구인구직", write: "✍️ 구인·구직 올리기", empty: "조건에 맞는 글이 아직 없어요. 지역을 넓혀 보세요" },
  ask: { aria: "1대1 레슨 구해요", write: "🙋 레슨 구해요 올리기", empty: "이 지역에 올라온 글이 아직 없어요" },
};

/**
 * 게시판 한 탭: 📋 대강(sub) · 💼 구인구직(job) · 🙋 1대1 레슨 구해요(ask).
 * 거르기는 탭마다 브라우저에 따로 기억한다. 🔔 지역 알림은 대강·구인 탭에만
 */
export function GigBoard({ kind, offToken }: { kind: GigKind; offToken?: string }) {
  const [f, setF] = useState<Filter | null>(null);
  const [items, setItems] = useState<GigCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => setF(readFilter(kind)), [kind]);

  useEffect(() => {
    if (!f) return;
    try {
      window.localStorage.setItem(keyOf(kind), JSON.stringify(f));
    } catch {}
    let stop = false;
    setFailed(false);
    // 탭에 없는 거르기 값은 보내지 않는다
    const used: Partial<Filter> =
      kind === "sub"
        ? { sido: f.sido, sigungu: f.sigungu, when: f.when, classType: f.classType }
        : kind === "job"
          ? { sido: f.sido, sigungu: f.sigungu, classType: f.classType, jobType: f.jobType, beginner: f.beginner, band: f.band }
          : { sido: f.sido, sigungu: f.sigungu, band: f.band };
    const qs = new URLSearchParams(Object.entries({ kind, ...used, page: String(page) }).filter(([, v]) => v) as [string, string][]);
    fetch(`/api/gigs?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { items: GigCard[]; total: number }) => {
        if (stop) return;
        setItems((prev) => (page > 1 && prev ? [...prev, ...d.items] : d.items));
        setTotal(d.total);
      })
      .catch(() => !stop && setFailed(true));
    return () => {
      stop = true;
    };
  }, [f, page, kind]);

  if (!f) return null;
  const set = (patch: Partial<Filter>) => {
    setPage(1);
    setItems(null);
    setF({ ...f, ...patch });
  };
  const toggle = <K extends "when" | "beginner" | "band" | "jobType">(k: K, v: Filter[K]) => set({ [k]: f[k] === v ? "" : v } as Partial<Filter>);
  const districts = f.sido ? districtsOf(f.sido) : [];
  const copy = COPY[kind];
  const showLessonNotice = kind === "ask" || (kind === "job" && (f.jobType === "" || f.jobType === "lesson"));

  return (
    <section className="gig-board" aria-label={copy.aria}>
      {offToken && <GigOff token={offToken} />}
      <Link className="btn btn-primary tab-write" href={`/gigs/new?kind=${kind}`}>{copy.write}</Link>
      {kind === "job" && <p className="hint gig-guide">{JOB_GUIDE} · 1대1 레슨 강사라면 <Link href="/gigs/new?kind=job&type=lesson">1대1 레슨 가능 올리기</Link></p>}
      {kind === "sub" && <p className="hint gig-guide">{GIG_GUIDE}</p>}
      {kind === "ask" && <p className="hint gig-guide">원하는 지역·시간대를 남기면 맞는 강사 글을 보여 드려요 · 강사라면 <Link href="/gigs/new?kind=job&type=lesson">1대1 레슨 가능 올리기</Link></p>}
      {showLessonNotice && <LessonNotice />}
      <div className="gig-filters">
        <div className="kids-picker-row">
          <select className="select" aria-label="시·도" value={f.sido} onChange={(e) => set({ sido: e.target.value, sigungu: "" })}>
            <option value="">전국</option>
            {REGIONS.map((r) => <option key={r.short} value={r.short}>{r.short}</option>)}
          </select>
          {districts.length > 0 && (
            <select className="select" aria-label="시·군·구" value={f.sigungu} onChange={(e) => set({ sigungu: e.target.value })}>
              <option value="">{f.sido} 전체</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>
        {kind === "job" && (
          <div className="chips" role="group" aria-label="구분">
            {JOB_TYPE_KEYS.map((k) => (
              <button key={k} type="button" className="chip chip-sm" aria-pressed={f.jobType === k} onClick={() => toggle("jobType", k)}>{JOB_TYPES[k]}</button>
            ))}
          </div>
        )}
        <div className="chips">
          {kind === "sub" && (
            <>
              <button type="button" className="chip chip-sm" aria-pressed={f.when === "today"} onClick={() => toggle("when", "today")}>오늘</button>
              <button type="button" className="chip chip-sm" aria-pressed={f.when === "week"} onClick={() => toggle("when", "week")}>이번 주</button>
            </>
          )}
          {kind === "job" && <button type="button" className="chip chip-sm" aria-pressed={f.beginner === "1"} onClick={() => toggle("beginner", "1")}>🌱 초보 가능</button>}
          {kind !== "sub" && TIME_BANDS.map((b) => (
            <button key={b} type="button" className="chip chip-sm" aria-pressed={f.band === b} onClick={() => toggle("band", b)}>{b}</button>
          ))}
          {kind !== "ask" && (
            <select className={`chip chip-sm${f.classType ? " picked" : ""}`} aria-label="수업" value={f.classType} onChange={(e) => set({ classType: e.target.value })}>
              <option value="">수업 전체</option>
              {CLASS_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>
      {kind !== "ask" && <GigAlert sido={f.sido} sigungu={f.sigungu} />}
      {failed ? (
        <p className="empty">잠시 후 다시 볼 수 있어요</p>
      ) : items === null ? (
        <p className="hint kids-loading" aria-busy="true">불러오는 중</p>
      ) : items.length === 0 ? (
        <p className="empty">{copy.empty}</p>
      ) : (
        <>
          <div className="kids-grid">
            {items.map((g) => <GigCardView key={g.id} g={g} />)}
          </div>
          {items.length < total && (
            <button type="button" className="btn gig-more" onClick={() => setPage(page + 1)}>더 보기</button>
          )}
        </>
      )}
    </section>
  );
}

/** 알림에서 들어왔을 때: 한 번 눌러 대강 알림 끄기 */
export function GigOff({ token }: { token: string }) {
  const [done, setDone] = useState<null | "ok" | "fail">(null);
  if (done === "ok") return <p className="hint gig-off">🔕 대강·구인 알림을 껐어요</p>;
  return (
    <p className="gig-off">
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          const r = await fetch("/api/push/gigs/off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ u: token }) }).catch(() => null);
          setDone(r?.ok ? "ok" : "fail");
          try {
            if (r?.ok) window.localStorage.removeItem("lr:gigAlert");
          } catch {}
        }}
      >
        🔕 이 알림 그만 받기
      </button>
      {done === "fail" && <span className="hint"> 끄지 못했어요</span>}
    </p>
  );
}
