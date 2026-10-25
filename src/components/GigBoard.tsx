"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CLASS_TYPES, GIG_GUIDE, REGIONS, districtsOf, payLabel, whenLabel, type GigKind } from "@/lib/instructorRoom";
import type { GigCard } from "@/lib/repo/gigs";
import { GigAlert } from "./GigAlert";

const KEY = "lr:gigFilter";
type Filter = { sido: string; sigungu: string; when: "" | "today" | "week"; classType: string; kind: "" | GigKind };
const EMPTY: Filter = { sido: "", sigungu: "", when: "", classType: "", kind: "" };

function readFilter(): Filter {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Filter> | null;
    return { ...EMPTY, ...(v ?? {}) };
  } catch {
    return EMPTY;
  }
}

/** 📋 대강·구인 카드: 연락처 없이 */
export function GigCardView({ g }: { g: GigCard }) {
  const place = [g.sigungu || g.sido, g.station && `${g.station}역`].filter(Boolean).join(" · ");
  return (
    <Link href={`/gigs/${g.id}`} className="kids-card gig-card">
      <div className="kids-chips">
        {g.urgent ? <span className="kids-chip st-open">🔥 오늘 급구</span> : <span className={`kids-chip ${g.kind === "sub" ? "kind" : "st-soon"}`}>{g.kind === "sub" ? "대강" : "정규"}</span>}
        <span className="kids-chip">{g.classType}</span>
        {g.pay ? <span className="kids-chip free">{payLabel(g.pay)}</span> : null}
      </div>
      <span className="kids-name">{whenLabel(g)}{g.times.length ? ` · ${g.times.slice(0, 4).join(", ")}${g.times.length > 4 ? "…" : ""}` : ""}</span>
      <span className="kids-where">{[place, g.studio].filter(Boolean).join(" · ")}</span>
    </Link>
  );
}

/** 🧘 강사방 📋 대강·구인 탭: 거르기(지역·날짜·수업·종류, 브라우저에 기억) · 카드 · 🔔 지역 알림 */
export function GigBoard({ offToken }: { offToken?: string }) {
  const [f, setF] = useState<Filter | null>(null);
  const [items, setItems] = useState<GigCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => setF(readFilter()), []);

  useEffect(() => {
    if (!f) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(f));
    } catch {}
    let stop = false;
    setFailed(false);
    const qs = new URLSearchParams(Object.entries({ ...f, page: String(page) }).filter(([, v]) => v) as [string, string][]);
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
  }, [f, page]);

  if (!f) return null;
  const set = (patch: Partial<Filter>) => {
    setPage(1);
    setItems(null);
    setF({ ...f, ...patch });
  };
  const toggle = <K extends "when" | "kind">(k: K, v: Filter[K]) => set({ [k]: f[k] === v ? "" : v } as Partial<Filter>);
  const districts = f.sido ? districtsOf(f.sido) : [];

  return (
    <section className="gig-board" aria-label="대강·구인">
      {offToken && <GigOff token={offToken} />}
      <Link className="btn btn-primary tab-write" href="/gigs/new">✍️ 대강·구인 올리기</Link>
      <p className="hint gig-guide">{GIG_GUIDE}</p>
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
        <div className="chips">
          <button type="button" className="chip chip-sm" aria-pressed={f.when === "today"} onClick={() => toggle("when", "today")}>오늘</button>
          <button type="button" className="chip chip-sm" aria-pressed={f.when === "week"} onClick={() => toggle("when", "week")}>이번 주</button>
          <button type="button" className="chip chip-sm" aria-pressed={f.kind === "sub"} onClick={() => toggle("kind", "sub")}>대강</button>
          <button type="button" className="chip chip-sm" aria-pressed={f.kind === "regular"} onClick={() => toggle("kind", "regular")}>정규</button>
          <select className={`chip chip-sm${f.classType ? " picked" : ""}`} aria-label="수업" value={f.classType} onChange={(e) => set({ classType: e.target.value })}>
            <option value="">수업 전체</option>
            {CLASS_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <GigAlert sido={f.sido} sigungu={f.sigungu} />
      {failed ? (
        <p className="empty">잠시 후 다시 볼 수 있어요</p>
      ) : items === null ? (
        <p className="hint kids-loading" aria-busy="true">불러오는 중</p>
      ) : items.length === 0 ? (
        <p className="empty">조건에 맞는 글이 아직 없어요</p>
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
