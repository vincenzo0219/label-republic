"use client";

import { useState } from "react";
import { REGIONS } from "@/lib/instructorRoom";
import { GENDERS, type Gender, type SinglesProfile } from "@/lib/singlesEvents";

/** 시·도 + 시·군·구 고르기. 값은 "경남" 또는 "경남 창원시" (빈 값이면 null) */
function RegionSelect({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const [sido = "", sigungu = ""] = (value ?? "").split(" ");
  const districts = REGIONS.find((r) => r.short === sido)?.districts ?? [];
  return (
    <span className="singles-region">
      <select aria-label={`${label} 시·도`} value={sido} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{label} (선택)</option>
        {REGIONS.map((r) => (
          <option key={r.short} value={r.short}>
            {r.short}
          </option>
        ))}
      </select>
      {districts.length > 0 && (
        <select aria-label={`${label} 시·군·구`} value={sigungu} onChange={(e) => onChange(e.target.value ? `${sido} ${e.target.value}` : sido)}>
          <option value="">시·군·구 (선택)</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

/** "나 신청 가능?" 입력. 값은 이 브라우저에만 저장한다 (부모가 localStorage 에 씀) */
export function SinglesChecker({ profile, onChange, onClear, thisYear }: { profile: SinglesProfile; onChange: (p: SinglesProfile) => void; onClear: () => void; thisYear: number }) {
  const years: number[] = [];
  for (let y = thisYear - 19; y >= 1960; y--) years.push(y);
  const set = (patch: Partial<SinglesProfile>) => onChange({ ...profile, ...patch });
  // 🔎 11/5 시작 쉬움 점검: 폼이 행사 카드 앞을 다 차지해서 첫 카드가 화면 밖 → 칩 하나로 접고, 누르면 펼친다
  const [open, setOpen] = useState(false);
  const summary = [profile.birthYear ? `${profile.birthYear}년생` : "", profile.gender ? GENDERS[profile.gender] : "", profile.live ?? "", profile.firstMarriage === true ? "초혼" : profile.firstMarriage === false ? "재혼" : ""].filter(Boolean).join(" · ");
  return (
    <section className={`singles-checker${open ? "" : " folded"}`} aria-label="나 신청 가능?">
      <button type="button" className={`chip singles-cond${summary ? " picked" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        🔎 내 조건{summary ? ` · ${summary}` : " 넣고 신청 가능 행사 보기"} {open ? "▲" : "▼"}
      </button>
      {open && (
      <>
      <div className="singles-inputs">
        <select aria-label="출생연도" value={profile.birthYear ?? ""} onChange={(e) => set({ birthYear: e.target.value ? Number(e.target.value) : null })}>
          <option value="">출생연도</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년생
            </option>
          ))}
        </select>
        <span className="chips">
          {(Object.keys(GENDERS) as Gender[]).map((g) => (
            <button key={g} type="button" className="chip chip-sm" aria-pressed={profile.gender === g} onClick={() => set({ gender: profile.gender === g ? null : g })}>
              {GENDERS[g]}
            </button>
          ))}
        </span>
        <RegionSelect label="거주 지역" value={profile.live} onChange={(v) => set({ live: v })} />
        <RegionSelect label="직장 지역" value={profile.work} onChange={(v) => set({ work: v })} />
        <span className="chips">
          <button type="button" className="chip chip-sm" aria-pressed={profile.firstMarriage === true} onClick={() => set({ firstMarriage: profile.firstMarriage === true ? null : true })}>
            초혼
          </button>
          <button type="button" className="chip chip-sm" aria-pressed={profile.firstMarriage === false} onClick={() => set({ firstMarriage: profile.firstMarriage === false ? null : false })}>
            재혼
          </button>
        </span>
      </div>
      <p className="hint">
        입력한 값은 이 기기에만 저장돼요. 서버로 보내지 않아요. <button type="button" className="linkish" onClick={onClear}>지우기</button>
      </p>
      </>
      )}
    </section>
  );
}

export { RegionSelect };
