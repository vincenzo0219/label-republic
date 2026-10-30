"use client";

import { celebrateWrite } from "./Celebrate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CLASS_TYPES,
  CONTRACTS,
  EQUIPMENT,
  GOALS,
  JOB_TYPES,
  JOB_TYPE_KEYS,
  LEVELS,
  MAX_AREAS,
  MEDICAL_MESSAGE,
  PLACES,
  REGIONS,
  SCREENING,
  TIME_BANDS,
  WEEKDAYS,
  districtsOf,
  kstYmd,
  mdLabel,
  medicalWordIn,
  payLabel,
  regionLabel,
  type ClassType,
  type Contract,
  type GigKind,
  type Goal,
  type JobType,
  type Level,
  type Place,
} from "@/lib/instructorRoom";
import type { GigDraft } from "@/lib/gigParse";
import { myNick, myPin, saveNick } from "@/lib/me";
import { LessonNotice } from "./GigBoard";

type State = Omit<GigDraft, "filled" | "pay" | "kind"> & {
  pay: string;
  jobType: JobType | null;
  payBase: string;
  payMax: string;
  payTiers: string;
  noshowPay: string;
  contract: Contract | null;
  career: string;
  beginnerOk: boolean;
  timeBands: string[];
  period: string;
  screening: string[];
  areas: string[];
  places: Place[];
  goal: Goal | null;
  level: Level | null;
};
const EMPTY: State = {
  studio: "", sido: "", sigungu: "", station: "", address: "", dates: [], weekdays: [], times: [],
  classType: null, equipment: [], pay: "", tax: null, payday: "", contact: "", notes: "",
  jobType: null, payBase: "", payMax: "", payTiers: "", noshowPay: "", contract: null, career: "", beginnerOk: false,
  timeBands: [], period: "", screening: [], areas: [], places: [], goal: null, level: null,
};
const MINE = "lr:myGigs";

/** "3.5" → 35000, "35,000" → 35000 */
export function payFromInput(v: string): number | null {
  const n = Number(v.replace(/[,원\s]/g, "").replace(/만$/, ""));
  if (!v.trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n <= 100 ? n * 10000 : n);
}

/** 기본급(월): "150" → 1500000 (만원 단위), "1,500,000" → 1500000 */
export function baseFromInput(v: string): number | null {
  const n = Number(v.replace(/[,원\s]/g, "").replace(/만$/, ""));
  if (!v.trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n < 10000 ? n * 10000 : n);
}

const toggleIn = <T,>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * 글 올리기: 📋 대강(kind=sub) · 💼 구인구직(kind=job, 구분에 따라 칸이 바뀜) · 🙋 레슨 구해요(kind=ask).
 * 대강·구인은 카톡 글 붙여넣기 → 칸 채우기. 레슨 글(1대1 레슨 가능·구해요)은 지역 여러 곳 + 고정 안내
 */
export function GigForm({ kind, jobType: initialType = null }: { kind: GigKind; jobType?: JobType | null }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [g, setG] = useState<State>({ ...EMPTY, jobType: kind === "job" ? initialType : null, classType: kind === "ask" ? "기타" : null });
  const [filled, setFilled] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [savedNick, setSavedNick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; id?: string } | null>(null);
  const [dateIn, setDateIn] = useState("");
  const [timeIn, setTimeIn] = useState("");
  const [areaSido, setAreaSido] = useState("");
  const [areaGu, setAreaGu] = useState("");
  const today = kstYmd(new Date());

  useEffect(() => {
    const n = myNick();
    if (n) {
      setNickname(n);
      setSavedNick(true);
    }
  }, []);

  const set = (patch: Partial<State>) => setG((prev) => ({ ...prev, ...patch }));
  const lesson = kind === "ask" || (kind === "job" && g.jobType === "lesson");
  const seek = kind === "job" && g.jobType === "seek";
  const listing = kind === "job" && !lesson;
  const canPaste = kind === "sub" || (listing && !seek);

  const parse = async () => {
    if (!raw.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/gigs/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: raw }) });
      const d = (await res.json()) as { draft?: GigDraft; error?: { message: string } };
      if (!res.ok || !d.draft) throw new Error(d.error?.message ?? "읽지 못했어요");
      const { filled: n, pay, kind: _k, ...rest } = d.draft;
      set({ ...rest, dates: kind === "sub" ? rest.dates : rest.dates.slice(0, 1), weekdays: kind === "sub" && rest.dates.length ? [] : rest.weekdays, pay: pay ? String(pay / 10000) : "" });
      setFilled(n);
    } catch (e) {
      setErr({ msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (lesson && medicalWordIn(g.studio, g.notes, g.career, g.address)) return setErr({ msg: MEDICAL_MESSAGE });
    setBusy(true);
    try {
      const body = {
        nickname: nickname.trim(),
        pw: myPin(),
        kind,
        studio: seek || kind === "ask" ? "" : g.studio,
        sido: g.sido,
        sigungu: g.sigungu,
        station: g.station.replace(/역$/, ""),
        address: g.address,
        dates: kind === "sub" ? g.dates : listing ? g.dates.slice(0, 1) : [],
        weekdays: g.weekdays,
        times: g.times,
        classType: g.classType,
        equipment: g.classType === "기구필라테스" ? g.equipment : [],
        pay: payFromInput(g.pay),
        tax: kind === "sub" ? g.tax : null,
        payday: kind === "sub" ? g.payday : "",
        contact: g.contact,
        notes: g.notes,
        raw: raw.slice(0, 4000),
        jobType: kind === "job" ? g.jobType : null,
        payBase: listing ? baseFromInput(g.payBase) : null,
        payMax: lesson ? payFromInput(g.payMax) : null,
        payTiers: g.payTiers,
        noshowPay: g.noshowPay,
        contract: g.contract,
        career: g.career,
        beginnerOk: g.beginnerOk,
        timeBands: g.timeBands,
        period: g.period,
        screening: g.screening,
        areas: lesson ? g.areas : [],
        places: g.places,
        goal: g.goal,
        level: g.level,
      };
      const res = await fetch("/api/gigs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json()) as { id?: string; error?: { message: string; code: string } };
      if (!res.ok) {
        setErr({ msg: d.error?.message ?? "올리지 못했어요", id: d.error?.code === "duplicate_gig" ? d.id : undefined });
        return;
      }
      celebrateWrite();
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
  const areaDistricts = areaSido ? districtsOf(areaSido) : [];
  const addDate = (d: string) => d && d >= today && !g.dates.includes(d) && set({ dates: [...g.dates, d].sort() });
  const addTime = (t: string) => /^\d{2}:\d{2}$/.test(t) && !g.times.includes(t) && set({ times: [...g.times, t].sort() });
  const addArea = () => {
    const a = regionLabel(areaSido, areaGu);
    if (areaSido && !g.areas.includes(a) && g.areas.length < MAX_AREAS) set({ areas: [...g.areas, a] });
    setAreaGu("");
  };
  const pay = payFromInput(g.pay);
  const payMax = payFromInput(g.payMax);
  const base = baseFromInput(g.payBase);
  const needPay = listing && !pay && !base;
  const ready =
    !!g.classType && !!g.contact.trim() && nickname.trim().length >= 2 && (lesson ? g.areas.length > 0 : !!g.sido) && (kind !== "job" || !!g.jobType) && !needPay;

  const weekdayPicker = (label: string) => (
    <div className="field">
      <span>{label}</span>
      <div className="chips">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button key={d} type="button" className="chip chip-sm" aria-pressed={g.weekdays.includes(d)} onClick={() => set({ weekdays: toggleIn(g.weekdays, d) })}>
            {WEEKDAYS[d]}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="시간대">
        {TIME_BANDS.map((b) => (
          <button key={b} type="button" className="chip chip-sm" aria-pressed={g.timeBands.includes(b)} onClick={() => set({ timeBands: toggleIn(g.timeBands, b) })}>
            {b}
          </button>
        ))}
      </div>
    </div>
  );

  const classPicker = (label: string) => (
    <div className="field">
      <span>{label}</span>
      <div className="chips" role="radiogroup" aria-label="수업">
        {CLASS_TYPES.map((c) => (
          <button key={c} type="button" className="chip chip-sm" role="radio" aria-checked={g.classType === c} onClick={() => set({ classType: c as ClassType })}>
            {kind === "ask" && c === "기타" ? "상관없음" : c}
          </button>
        ))}
      </div>
      {g.classType === "기구필라테스" && (
        <div className="chips">
          {EQUIPMENT.filter((e) => e !== "소도구").map((e) => (
            <button key={e} type="button" className="chip chip-sm" aria-pressed={g.equipment.includes(e)} onClick={() => set({ equipment: toggleIn(g.equipment, e) })}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <form className="form gig-form" onSubmit={submit}>
      {lesson && <LessonNotice />}
      {canPaste && (
        <>
          <label className="field">
            <span>카톡 글 붙여넣기</span>
            <textarea className="textarea short" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"업체명, 주소, 날짜·요일, 시간, 페이, 연락처가 담긴 글"} maxLength={6000} />
          </label>
          <button type="button" className="btn" onClick={parse} disabled={busy || !raw.trim()}>칸 채우기</button>
          {filled !== null && <p className="hint" role="status">{filled}칸 채웠어요 · 아래에서 확인하고 올려 주세요</p>}
        </>
      )}

      {kind === "job" && (
        <div className="field">
          <span>구분</span>
          <div className="chips" role="radiogroup" aria-label="구분">
            {JOB_TYPE_KEYS.map((k) => (
              <button key={k} type="button" className="chip chip-sm" role="radio" aria-checked={g.jobType === k} onClick={() => set({ jobType: k })}>
                {JOB_TYPES[k]}
              </button>
            ))}
          </div>
        </div>
      )}

      {(kind === "sub" || (listing && !seek)) && (
        <label className="field">
          <span>{kind === "sub" ? "업체명" : "센터·기관명"}</span>
          <input className="input" value={g.studio} maxLength={60} onChange={(e) => set({ studio: e.target.value })} placeholder={kind === "job" ? "OO필라테스 · OO아파트 커뮤니티센터" : ""} />
        </label>
      )}

      {lesson ? (
        <div className="field">
          <span>{kind === "ask" ? "원하는 지역 (여러 곳)" : "레슨 가능 지역 (여러 곳)"}</span>
          <div className="chips">
            {g.areas.map((a) => (
              <button key={a} type="button" className="chip chip-sm" aria-pressed="true" onClick={() => set({ areas: g.areas.filter((x) => x !== a) })} aria-label={`${a} 빼기`}>
                {a} ✕
              </button>
            ))}
          </div>
          {g.areas.length < MAX_AREAS && (
            <div className="kids-picker-row">
              <select className="select" aria-label="시·도" value={areaSido} onChange={(e) => (setAreaSido(e.target.value), setAreaGu(""))}>
                <option value="">시·도</option>
                {REGIONS.map((r) => <option key={r.short} value={r.short}>{r.short}</option>)}
              </select>
              {areaDistricts.length > 0 && (
                <select className="select" aria-label="시·군·구" value={areaGu} onChange={(e) => setAreaGu(e.target.value)}>
                  <option value="">{areaSido} 전체</option>
                  {areaDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              <button type="button" className="btn btn-sm" onClick={addArea} disabled={!areaSido}>지역 넣기</button>
            </div>
          )}
        </div>
      ) : (
        <div className="field">
          <span>{seek ? "희망 지역" : "지역"}</span>
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
          {!seek && (
            <div className="kids-picker-row">
              <input className="input" placeholder="역 (선택)" value={g.station} maxLength={20} onChange={(e) => set({ station: e.target.value })} aria-label="역" />
              <input className="input" placeholder="주소 (선택)" value={g.address} maxLength={120} onChange={(e) => set({ address: e.target.value })} aria-label="주소" />
            </div>
          )}
        </div>
      )}

      {kind === "sub" ? (
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
        weekdayPicker(kind === "ask" ? "희망 요일·시간대" : seek || lesson ? "가능 요일·시간대" : "근무 요일·시간대")
      )}

      {(kind === "sub" || listing) && (
        <div className="field">
          <span>{kind === "sub" ? "시간" : "수업 시간 (선택)"}</span>
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
      )}

      {classPicker(kind === "ask" ? "원하는 수업" : "수업")}

      {kind === "ask" && (
        <>
          <div className="field">
            <span>목표</span>
            <div className="chips" role="radiogroup" aria-label="목표">
              {(Object.keys(GOALS) as Goal[]).map((k) => (
                <button key={k} type="button" className="chip chip-sm" role="radio" aria-checked={g.goal === k} onClick={() => set({ goal: k })}>{GOALS[k]}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>경험</span>
            <div className="chips" role="radiogroup" aria-label="경험">
              {(Object.keys(LEVELS) as Level[]).map((k) => (
                <button key={k} type="button" className="chip chip-sm" role="radio" aria-checked={g.level === k} onClick={() => set({ level: k })}>{LEVELS[k]}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {kind === "sub" && (
        <>
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
        </>
      )}

      {lesson && (
        <div className="field">
          <span>{kind === "ask" ? "희망 금액 (회당, 만원, 선택)" : "회당 금액 (만원)"}</span>
          <div className="kids-picker-row">
            <input className="input" inputMode="decimal" placeholder="5" value={g.pay} maxLength={10} onChange={(e) => set({ pay: e.target.value })} aria-label="최소 금액" />
            <span aria-hidden="true">~</span>
            <input className="input" inputMode="decimal" placeholder="7" value={g.payMax} maxLength={10} onChange={(e) => set({ payMax: e.target.value })} aria-label="최대 금액" />
          </div>
          {pay ? <span className="hint">{pay.toLocaleString("ko-KR")}원{payMax && payMax > pay ? ` ~ ${payMax.toLocaleString("ko-KR")}원` : ""}</span> : null}
        </div>
      )}

      {kind === "job" && g.jobType === "lesson" && (
        <>
          <div className="field">
            <span>장소</span>
            <div className="chips" role="group" aria-label="장소">
              {(Object.keys(PLACES) as Place[]).map((k) => (
                <button key={k} type="button" className="chip chip-sm" aria-pressed={g.places.includes(k)} onClick={() => set({ places: toggleIn(g.places, k) })}>{PLACES[k]}</button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>자격·경력 한 줄</span>
            <input className="input" value={g.career} maxLength={60} onChange={(e) => set({ career: e.target.value })} placeholder="필라테스 자격 · 강사 5년" />
          </label>
        </>
      )}

      {listing && (
        <>
          <div className="field">
            <span>{seek ? "희망 급여 (회당 금액이나 기본급 중 하나는 꼭)" : "급여 (회당 금액이나 기본급 중 하나는 꼭)"}</span>
            <div className="kids-picker-row">
              <input className="input" inputMode="decimal" placeholder="회당 3 (만원)" value={g.pay} maxLength={10} onChange={(e) => set({ pay: e.target.value })} aria-label="회당 금액 (만원)" />
              <input className="input" inputMode="decimal" placeholder="기본급 월 150 (만원)" value={g.payBase} maxLength={12} onChange={(e) => set({ payBase: e.target.value })} aria-label="기본급 (월, 만원)" />
            </div>
            {pay || base ? (
              <span className="hint">{[pay ? `회당 ${pay.toLocaleString("ko-KR")}원` : "", base ? `기본급 월 ${base.toLocaleString("ko-KR")}원` : ""].filter(Boolean).join(" · ")}</span>
            ) : null}
            {!seek && (
              <>
                <input className="input" value={g.payTiers} maxLength={120} onChange={(e) => set({ payTiers: e.target.value })} placeholder="인원 차등 (선택) 예) 5명 이상 1만 추가" aria-label="인원 차등" />
                <input className="input" value={g.noshowPay} maxLength={120} onChange={(e) => set({ noshowPay: e.target.value })} placeholder="노쇼·폐강 시 페이 (선택) 예) 노쇼도 100%, 폐강은 50%" aria-label="노쇼·폐강 시 페이" />
              </>
            )}
            <div className="chips" role="radiogroup" aria-label="계약 형태">
              {(Object.keys(CONTRACTS) as Contract[]).map((k) => (
                <button key={k} type="button" className="chip chip-sm" role="radio" aria-checked={g.contract === k} onClick={() => set({ contract: g.contract === k ? null : k })}>{CONTRACTS[k]}</button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>{seek ? "경력" : "경력 요건"}</span>
            <input className="input" value={g.career} maxLength={60} onChange={(e) => set({ career: e.target.value })} placeholder={seek ? "기구 2년 · 자격 있음" : "기구 1년 이상"} />
          </label>
          {!seek && (
            <label className="field gig-check">
              <input type="checkbox" checked={g.beginnerOk} onChange={(e) => set({ beginnerOk: e.target.checked })} /> <span>🌱 초보 가능</span>
            </label>
          )}
          <div className="field">
            <span>{seek ? "가능 시작일·기간 (선택)" : "시작일·기간 (선택)"}</span>
            <div className="kids-picker-row">
              <input className="input" type="date" min={today} value={g.dates[0] ?? ""} onChange={(e) => set({ dates: e.target.value ? [e.target.value] : [] })} aria-label="시작일" />
              <input className="input" value={g.period} maxLength={60} onChange={(e) => set({ period: e.target.value })} placeholder="6개월 · 장기" aria-label="기간" />
            </div>
          </div>
          {!seek && (
            <div className="field">
              <span>면접·시강</span>
              <div className="chips" role="group" aria-label="면접·시강">
                {SCREENING.map((s) => (
                  <button key={s} type="button" className="chip chip-sm" aria-pressed={g.screening.includes(s)} onClick={() => set({ screening: toggleIn(g.screening, s) })}>{s}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <label className="field">
        <span>연락 방법 (전화·카톡·이메일)</span>
        <input className="input" value={g.contact} required minLength={4} maxLength={160} onChange={(e) => set({ contact: e.target.value })} />
        <span className="hint">글 화면에서 버튼을 눌러야 보여요 · 목록·검색에는 안 나가요</span>
      </label>
      <label className="field">
        <span>{kind === "sub" ? "요청사항" : kind === "ask" ? "하고 싶은 말 (선택)" : lesson ? "소개 (선택)" : "더 적을 것 (선택)"}</span>
        <textarea
          className="textarea short"
          value={g.notes}
          maxLength={1000}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder={kind === "sub" ? "지각·노쇼 없이, 20분 전 도착" : kind === "ask" ? "주 1회, 퇴근 후 저녁이 좋아요" : lesson ? "수업 방식 · 첫 수업 안내" : "복리후생 · 수업 인원"}
        />
      </label>
      {!savedNick && (
        <label className="field">
          <span>닉네임</span>
          <input className="input" value={nickname} minLength={2} maxLength={20} required onChange={(e) => setNickname(e.target.value)} />
        </label>
      )}
      {needPay && g.jobType && <p className="hint">회당 금액이나 기본급을 넣어 주세요</p>}
      {err && (
        <p className="error" role="alert">
          {err.msg}
          {err.id && <> · <Link href={`/gigs/${err.id}`}>올라간 글 보기</Link></>}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy || !ready}>
        {savedNick ? `${nickname} 이름으로 올리기` : "올리기"}
      </button>
    </form>
  );
}
