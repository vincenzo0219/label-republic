"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { programPath, programStatus, type KidsProgram, type KidsStatus } from "@/lib/kidsPrograms";
import { KidsAlertButton } from "./KidsAlertButton";

/** 아이볼 그리드 카드: 종류 · 이름 · 기관 · 도시 · 연령 · 무료 · 접수 상태 · 🔔 */
export function KidsCard({ program: p, mini = false }: { program: KidsProgram; mini?: boolean }) {
  const [status, setStatus] = useState<KidsStatus | undefined>(undefined);
  useEffect(() => setStatus(programStatus(p)), [p]);
  const where = [p.institution, p.city].filter(Boolean).join(" · ");
  return (
    <div className={`kids-card${mini ? " mini" : ""}`}>
      <Link href={programPath(p.id)} className="kids-card-link">
        <span className="kids-chips">
          {p.kind && <span className="kids-chip kind">{p.kind}</span>}
          {!mini && p.age && <span className="kids-chip">{p.age}</span>}
          {p.free && <span className="kids-chip free">무료</span>}
          {status && <span className={`kids-chip st-${status.key}`}>{status.label}</span>}
        </span>
        <span className="kids-name">{p.name}</span>
        {where && <span className="kids-where">{where}</span>}
      </Link>
      {!mini && (
        <span className="kids-actions">
          <KidsAlertButton program={p} />
        </span>
      )}
    </div>
  );
}
