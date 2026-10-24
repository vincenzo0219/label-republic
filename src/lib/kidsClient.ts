/** 📍 동네 체험: 브라우저 쪽 작은 도우미 (지역 기억, 켠 🔔, 클릭 기록) */
import { isValidArea, programPath, type KidsProgram } from "./kidsPrograms";

const AREA_KEY = "lr:kidsArea";
const ALERTS_KEY = "lr:kidsAlerts";

export function getArea(): string | null {
  try {
    const v = window.localStorage.getItem(AREA_KEY);
    return isValidArea(v) ? v : null;
  } catch {
    return null;
  }
}

export function setArea(area: string) {
  try {
    window.localStorage.setItem(AREA_KEY, area);
  } catch {}
}

export function getAlerts(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(ALERTS_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setAlert(id: string, on: boolean) {
  const rest = getAlerts().filter((x) => x !== id);
  try {
    window.localStorage.setItem(ALERTS_KEY, JSON.stringify((on ? [...rest, id] : rest).slice(-100)));
  } catch {}
}

export const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** 아이볼·신청 링크로 나가는 클릭을 조회 기록에 (/kids/<id>/out/<ibol|apply>?from=ibol_card) */
export function trackOut(p: Pick<KidsProgram, "id">, kind: "ibol" | "apply") {
  const payload = JSON.stringify({ path: `${programPath(p.id)}/out/${kind}?from=ibol_card`, landing: false });
  try {
    if (!navigator.sendBeacon?.("/api/metrics/pageview", new Blob([payload], { type: "application/json" }))) {
      void fetch("/api/metrics/pageview", { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {}
}

export async function loadPrograms(params: Record<string, string>): Promise<KidsProgram[]> {
  const res = await fetch(`/api/kids-programs?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { items: KidsProgram[] }).items;
}
