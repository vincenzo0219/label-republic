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
        <select aria-label="시·도" value={sido} onChange={(e) => {
          setSido(e.target.value);
          const r = REGIONS.find((x) => x.name === e.target.value);
          if (r && r.districts.length === 0) onPick(r.short);
        }}>
          <option value="">시·도</option>
          {REGIONS.map((r) => <option key={r.name} value={r.name}>{r.short}</option>)}
        </select>
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
