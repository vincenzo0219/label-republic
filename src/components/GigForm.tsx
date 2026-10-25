"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CLASS_TYPES, EQUIPMENT, REGIONS, WEEKDAYS, districtsOf, kstYmd, mdLabel, payLabel, type ClassType, type GigKind } from "@/lib/instructorRoom";
import type { GigDraft } from "@/lib/gigParse";
import { myNick, myPin, saveNick } from "@/lib/me";

type State = Omit<GigDraft, "filled" | "pay"> & { pay: string };
const EMPTY: State = {
  kind: "sub", studio: "", sido: "", sigungu: "", station: "", address: "", dates: [], weekdays: [], times: [],
  classType: null, equipment: [], pay: "", tax: null, payday: "", contact: "", notes: "",
};
const MINE = "lr:myGigs";

/** "3.5" → 35000, "35,000" → 35000 */
export function payFromInput(v: string): number | null {
  const n = Number(v.replace(/[,원\s]/g, "").replace(/만$/, ""));
  if (!v.trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n <= 100 ? n * 10000 : n);
}

/** 📋 대강·구인 올리기: 카톡 글 붙여넣기 → 칸 채우기 → 확인하고 올리기 */
export function GigForm() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [g, setG] = useState<State>(EMPTY);
  const [filled, setFilled] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [savedNick, setSavedNick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; id?: string } | null>(null);
  const [dateIn, setDateIn] = useState("");
  const [timeIn, setTimeIn] = useState("");
  const today = kstYmd(new Date());

  useEffect(() => {
    const n = myNick();
    if (n) {
      setNickname(n);
      setSavedNick(true);
    }
  }, []);

  const set = (patch: Partial<State>) => setG((prev) => ({ ...prev, ...patch }));

  const parse = async () => {
    if (!raw.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/gigs/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: raw }) });
      const d = (await res.json()) as { draft?: GigDraft; error?: { message: string } };
      if (!res.ok || !d.draft) throw new Error(d.error?.message ?? "읽지 못했어요");
      const { filled: n, pay, ...rest } = d.draft;
      setG({ ...rest, kind: rest.kind ?? "sub", pay: pay ? String(pay / 10000) : "" });
      setFilled(n);
    } catch (e) {
      setErr({ msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = {
        nickname: nickname.trim(),
        pw: myPin(),
        kind: g.kind,
        studio: g.studio,
        sido: g.sido,
        sigungu: g.sigungu,
        station: g.station.replace(/역$/, ""),
        address: g.address,
        dates: g.kind === "sub" ? g.dates : g.dates.slice(0, 1),
        weekdays: g.weekdays,
        times: g.times,
        classType: g.classType,
        equipment: g.classType === "기구필라테스" ? g.equipment : [],
        pay: payFromInput(g.pay),
        tax: g.tax,
        payday: g.payday,
        contact: g.contact,
        notes: g.notes,
        raw: raw.slice(0, 4000),
      };
      const res = await fetch("/api/gigs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json()) as { id?: string; error?: { message: string; code: string } };
      if (!res.ok) {
        setErr({ msg: d.error?.message ?? "올리지 못했어요", id: d.error?.code === "duplicate_gig" ? d.id : undefined });
        return;
      }
      saveNick(body.nickname);
      try {
        const mine = JSON.parse(window.localStorage.getItem(MINE) ?? "[]") as string[];
        window.localStorage.setItem(MINE, JSON.stringify([d.id, ...mine].slice(0, 50)));
      } catch {}
      router.push(`/gigs/${d.id}`);
    } catch {
      setErr({ msg: "연결이 끊겼어요. 다시 눌러 주세요" });
    } finally {
      setBusy(false);
    }
  };

  const districts = g.sido ? districtsOf(g.sido) : [];
  const addDate = (d: string) => d && d >= today && !g.dates.includes(d) && set({ dates: [...g.dates, d].sort() });
  const addTime = (t: string) => /^\d{2}:\d{2}$/.test(t) && !g.times.includes(t) && set({ times: [...g.times, t].sort() });
  const pay = payFromInput(g.pay);

  return (
    <form className="form gig-form" onSubmit={submit}>
      <label className="field">
        <span>카톡 글 붙여넣기</span>
        <textarea className="textarea short" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"업체명, 주소, 날짜, 시간, 페이, 연락처가 담긴 글"} maxLength={6000} />
      </label>
      <button type="button" className="btn" onClick={parse} disabled={busy || !raw.trim()}>칸 채우기</button>
      {filled !== null && <p className="hint" role="status">{filled}칸 채웠어요 · 아래에서 확인하고 올려 주세요</p>}

      <div className="chips" role="radiogroup" aria-label="종류">
        {(["sub", "regular"] as GigKind[]).map((k) => (
          <button key={k} type="button" className="chip" role="radio" aria-checked={g.kind === k} onClick={() => set({ kind: k })}>
            {k === "sub" ? "대강" : "정규 구인"}
          </button>
        ))}
      </div>

      <label className="field">
        <span>업체명</span>
        <input className="input" value={g.studio} maxLength={60} onChange={(e) => set({ studio: e.target.value })} />
      </label>

      <div className="field">
        <span>지역</span>
        <div className="kids-picker-row">
          <select className="select" aria-label="시·도" value={g.sido} required onChange={(e) => set({ sido: e.target.value, sigungu: "" })}>
            <option value="">시·도</option>
            {REGIONS.map((r) => <option key={r.short} value={r.short}>{r.short}</option>)}
          </select>
          {districts.length > 0 && (
            <select className="select" aria-label="시·군·구" value={g.sigungu} onChange={(e) => set({ sigungu: e.target.value })}>
              <option value="">시·군·구</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>
        <div className="kids-picker-row">
          <input className="input" placeholder="역 (선택)" value={g.station} maxLength={20} onChange={(e) => set({ station: e.target.value })} aria-label="역" />
          <input className="input" placeholder="주소 (선택)" value={g.address} maxLength={120} onChange={(e) => set({ address: e.target.value })} aria-label="주소" />
        </div>
      </div>

      {g.kind === "sub" ? (
        <div className="field">
          <span>날짜</span>
          <div className="chips">
            {g.dates.map((d) => (
              <button key={d} type="button" className="chip chip-sm" aria-pressed="true" onClick={() => set({ dates: g.dates.filter((x) => x !== d) })} aria-label={`${mdLabel(d)} 빼기`}>
                {mdLabel(d)} ✕
              </button>
            ))}
          </div>
          <div className="kids-picker-row">
            <input className="input" type="date" min={today} value={dateIn} onChange={(e) => setDateIn(e.target.value)} aria-label="날짜 고르기" />
            <button type="button" className="btn btn-sm" onClick={() => (addDate(dateIn), setDateIn(""))}>날짜 넣기</button>
          </div>
        </div>
      ) : (
        <div className="field">
          <span>요일</span>
          <div className="chips">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = g.weekdays.includes(d);
              return (
                <button key={d} type="button" className="chip chip-sm" aria-pressed={on} onClick={() => set({ weekdays: on ? g.weekdays.filter((x) => x !== d) : [...g.weekdays, d] })}>
                  {WEEKDAYS[d]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="field">
        <span>시간</span>
        <div className="chips">
          {g.times.map((t) => (
            <button key={t} type="button" className="chip chip-sm" aria-pressed="true" onClick={() => set({ times: g.times.filter((x) => x !== t) })} aria-label={`${t} 빼기`}>
              {t} ✕
            </button>
          ))}
        </div>
        <div className="kids-picker-row">
          <input className="input" type="time" step={300} value={timeIn} onChange={(e) => setTimeIn(e.target.value)} aria-label="시간 고르기" />
          <button type="button" className="btn btn-sm" onClick={() => (addTime(timeIn), setTimeIn(""))}>시간 넣기</button>
        </div>
      </div>

      <div className="field">
        <span>수업</span>
        <div className="chips" role="radiogroup" aria-label="수업">
          {CLASS_TYPES.map((c) => (
            <button key={c} type="button" className="chip chip-sm" role="radio" aria-checked={g.classType === c} onClick={() => set({ classType: c as ClassType })}>
              {c}
            </button>
          ))}
        </div>
        {g.classType === "기구필라테스" && (
          <div className="chips">
            {EQUIPMENT.filter((e) => e !== "소도구").map((e) => {
              const on = g.equipment.includes(e);
              return (
                <button key={e} type="button" className="chip chip-sm" aria-pressed={on} onClick={() => set({ equipment: on ? g.equipment.filter((x) => x !== e) : [...g.equipment, e] })}>
                  {e}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <label className="field">
        <span>타임당 페이 (만원)</span>
        <input className="input" inputMode="decimal" placeholder="3.5" value={g.pay} maxLength={10} onChange={(e) => set({ pay: e.target.value })} />
        {pay ? <span className="hint">{pay.toLocaleString("ko-KR")}원 · {payLabel(pay)}</span> : null}
      </label>
      <div className="chips" role="radiogroup" aria-label="3.3% 공제">
        {([[true, "3.3% 공제"], [false, "공제 없음"], [null, "모름"]] as const).map(([v, label]) => (
          <button key={label} type="button" className="chip chip-sm" role="radio" aria-checked={g.tax === v} onClick={() => set({ tax: v })}>
            {label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>입금일</span>
        <input className="input" placeholder="수업 후 바로" value={g.payday} maxLength={60} onChange={(e) => set({ payday: e.target.value })} />
      </label>
      <label className="field">
        <span>연락처 (전화·카톡·이메일)</span>
        <input className="input" value={g.contact} required minLength={4} maxLength={160} onChange={(e) => set({ contact: e.target.value })} />
        <span className="hint">글 화면에서 버튼을 눌러야 보여요 · 목록·검색에는 안 나가요</span>
      </label>
      <label className="field">
        <span>요청사항</span>
        <textarea className="textarea short" value={g.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} placeholder="지각·노쇼 없이, 20분 전 도착" />
      </label>
      {!savedNick && (
        <label className="field">
          <span>닉네임</span>
          <input className="input" value={nickname} minLength={2} maxLength={20} required onChange={(e) => setNickname(e.target.value)} />
        </label>
      )}
      {err && (
        <p className="error" role="alert">
          {err.msg}
          {err.id && <> · <Link href={`/gigs/${err.id}`}>올라간 글 보기</Link></>}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy || !g.classType || !g.sido || !g.contact.trim() || nickname.trim().length < 2}>
        {savedNick ? `${nickname} 이름으로 올리기` : "올리기"}
      </button>
    </form>
  );
}
