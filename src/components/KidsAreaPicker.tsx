"use client";

import { useState } from "react";
import { REGIONS, areaOptions } from "@/lib/kidsPrograms";

/** 시·도 → 시·군·구. 세종은 바로 */
export function KidsAreaPicker({ onPick, current }: { onPick: (area: string) => void; current?: string | null }) {
  const [sido, setSido] = useState<string>(() => REGIONS.find((r) => current && (current === r.short || current.startsWith(`${r.short} `) || r.districts.includes(current)))?.name ?? "");
  const region = REGIONS.find((r) => r.name === sido);
  const options = region ? areaOptions(region) : [];
  return (
    <div className="kids-picker">
      <p className="kids-picker-title">📍 우리 동네</p>
      <div className="kids-picker-row">
        {/* 11/5 시작 쉬움 점검: 시·도는 고르는 칸 대신 칩으로 한 번에 (서울·경기·부산…) */}
        <div className="chips kids-sido" role="group" aria-label="시·도">
          {REGIONS.map((r) => (
            <button
              key={r.name}
              type="button"
              className="chip chip-sm"
              aria-pressed={sido === r.name}
              onClick={() => {
                setSido(r.name);
                if (r.districts.length === 0) onPick(r.short);
              }}
            >
              {r.short}
            </button>
          ))}
        </div>
        {region && options.length > 0 && (
          <select aria-label="시·군·구" value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
            <option value="">시·군·구</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
