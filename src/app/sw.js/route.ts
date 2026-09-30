import { readFileSync } from "node:fs";
import path from "node:path";
import { serviceWorkerSource, killSwitchSource } from "@/lib/sw-source";

export const dynamic = "force-dynamic";

// 빌드마다 다른 번호 → 배포하면 브라우저가 새 서비스 워커를 받고, 옛 오프라인 화면 캐시를 지운다
let version: string | null = null;
function buildVersion(): string {
  if (version) return version;
  try {
    version = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    version = "dev";
  }
  return version;
}

/** GET /sw.js — 서비스 워커 (오프라인 읽기·느린 망·푸시 알림) */
export function GET() {
  // 비상 스위치: 서비스 워커가 문제를 일으키면 SW_DISABLED=1 로 재시작 → 브라우저가 다음 접속 때 스스로 지운다 (RUNBOOK 5장)
  const source = process.env.SW_DISABLED === "1" ? killSwitchSource() : serviceWorkerSource(buildVersion());
  return new Response(source, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
