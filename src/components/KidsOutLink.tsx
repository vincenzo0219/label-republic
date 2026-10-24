"use client";

import { trackOut } from "@/lib/kidsClient";
import type { KidsProgram } from "@/lib/kidsPrograms";

/** 아이볼·기관 신청 링크 (기관 링크는 그대로). 누르면 조회 기록에 남긴다 */
export function KidsOutLink({ program, kind, className, children }: { program: Pick<KidsProgram, "id" | "applyUrl" | "ibolUrl">; kind: "apply" | "ibol"; className?: string; children: React.ReactNode }) {
  const href = kind === "apply" ? (program.applyUrl ?? program.ibolUrl) : program.ibolUrl;
  if (!href) return null;
  return (
    <a href={href} className={className} target="_blank" rel="noopener" onClick={() => trackOut(program, kind)}>
      {children}
    </a>
  );
}
