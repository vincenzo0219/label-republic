/**
 * 서버 오류 추적 (Sprint 18, 서버 전용).
 *
 * 외부 서비스 없이 DB 에 오류를 종류별로 묶어 센다. 기록은 요청을 늦추지 않도록 기다리지 않고,
 * 기록이 실패해도(예: DB 장애) 로그만 남기고 넘어간다. 같은 오류가 폭주하면 인스턴스별로 묶어서 쓴다.
 */
import { createHash } from "node:crypto";
import { config } from "./config";
import { query } from "./db";

export type ErrorKind = "api" | "page" | "job" | "process" | "client";
export type ErrorContext = { kind: ErrorKind; path?: string; where?: string };

/** 급증 알림 기준: 한 시간에 이만큼 */
export const SPIKE_PER_HOUR = 50;
const FLUSH_MS = 5_000;
const MAX_ALERTS_PER_HOUR = 10;

type Pending = { kind: ErrorKind; message: string; stack: string; path: string; n: number };
const pending = new Map<string, Pending>();
let timer: ReturnType<typeof setTimeout> | null = null;
let alertWindow = { start: Date.now(), n: 0 };

/** 메시지 속 숫자·따옴표 값은 묶음 키에서 빼고(같은 오류가 값마다 따로 쌓이지 않게), 길이를 자른다 */
function normalizeMessage(msg: string): string {
  return msg.replace(/\s+/g, " ").trim().slice(0, 500);
}
function groupKey(msg: string): string {
  return msg.replace(/"[^"]*"|'[^']*'/g, "?").replace(/\b\d+\b/g, "N").replace(/[0-9a-f]{16,}/gi, "H");
}

/** 스택에서 첫 번째 앱 코드 위치 (node_modules·node 내부 제외) */
function firstAppFrame(stack: string): string {
  return (
    stack
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .find((l) => !/node_modules|node:internal|\(node:/.test(l) && /(src|server)[/\\]/.test(l))
      ?.replace(/(:\d+){1,2}\)?$/, "") ?? ""
  );
}

export function fingerprintOf(kind: ErrorKind, message: string, stack: string): string {
  return createHash("sha1").update(`${kind}|${groupKey(message)}|${firstAppFrame(stack)}`).digest("hex");
}

/** 경로만 남긴다 (쿼리 문자열에 검색어·토큰이 있을 수 있어서) */
export function safePath(p: string | undefined): string {
  if (!p) return "";
  try {
    return new URL(p, "http://x").pathname.slice(0, 300);
  } catch {
    return p.split("?")[0]!.slice(0, 300);
  }
}

export function reportError(err: unknown, ctx: ErrorContext): void {
  const e = err instanceof Error ? err : new Error(String(err));
  const message = normalizeMessage(`${ctx.where ? `[${ctx.where}] ` : ""}${e.name !== "Error" ? `${e.name}: ` : ""}${e.message}`);
  const stack = (e.stack ?? "").slice(0, 4000);
  const fp = fingerprintOf(ctx.kind, message, stack);
  const cur = pending.get(fp);
  if (cur) cur.n++;
  else pending.set(fp, { kind: ctx.kind, message, stack, path: safePath(ctx.path), n: 1 });
  if (pending.size > 200) void flushErrors();
  timer ??= setTimeout(() => void flushErrors(), FLUSH_MS);
  timer.unref?.();
}

/** 모인 오류를 DB 에 쓰고, 새 오류·급증이면 알림 */
export async function flushErrors(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const batch = [...pending.entries()];
  pending.clear();
  for (const [fp, p] of batch) {
    try {
      const rows = await query<{ id: string; count: number; hour_count: number; is_new: boolean; reopened: boolean; alerted_at: string | null }>(
        `INSERT INTO error_events (fingerprint, kind, message, stack, path, count, hour_count)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (fingerprint) DO UPDATE SET
           count = error_events.count + EXCLUDED.count,
           hour_count = CASE WHEN error_events.hour_start < now() - interval '1 hour' THEN EXCLUDED.count ELSE error_events.hour_count + EXCLUDED.count END,
           hour_start = CASE WHEN error_events.hour_start < now() - interval '1 hour' THEN now() ELSE error_events.hour_start END,
           last_seen = now(), path = EXCLUDED.path, message = EXCLUDED.message, stack = EXCLUDED.stack,
           resolved_at = NULL
         RETURNING id, count, hour_count, (xmax = 0) AS is_new,
                   (xmax <> 0 AND (SELECT resolved_at IS NOT NULL FROM error_events WHERE fingerprint = $1)) AS reopened, alerted_at`,
        [fp, p.kind, p.message, p.stack, p.path, p.n],
      );
      const r = rows[0]!;
      const spike = r.hour_count >= SPIKE_PER_HOUR && (!r.alerted_at || Date.now() - Date.parse(r.alerted_at) > 3600_000);
      if (r.is_new || r.reopened || spike) {
        const label = r.is_new ? "새 오류" : r.reopened ? "해결 표시 후 재발" : `급증 (최근 1시간 ${r.hour_count}회)`;
        if (await sendAlert(`🚨 라벨공화국 ${label} [${p.kind}] ${p.message}${p.path ? ` — ${p.path}` : ""} (누적 ${r.count}회)`)) {
          await query("UPDATE error_events SET alerted_at = now() WHERE id = $1", [r.id]);
        }
      }
    } catch (e) {
      // 기록 자체가 실패하면(예: DB 장애) 로그만
      console.error("[error-tracking] 기록 실패:", (e as Error).message, "| 원래 오류:", p.message);
    }
  }
}

/** Slack·Discord 호환 웹훅 ({text}/{content}). 없으면 아무것도 안 함. 한 시간에 10건까지 */
export async function sendAlert(text: string): Promise<boolean> {
  const url = config.alertWebhookUrl;
  if (!url) return false;
  if (Date.now() - alertWindow.start > 3600_000) alertWindow = { start: Date.now(), n: 0 };
  if (alertWindow.n >= MAX_ALERTS_PER_HOUR) return false;
  alertWindow.n++;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 1500), content: text.slice(0, 1500) }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (e) {
    console.error("[alert] 웹훅 전송 실패:", (e as Error).message);
    return false;
  }
}

export function resetErrorTrackingForTests() {
  pending.clear();
  alertWindow = { start: Date.now(), n: 0 };
}
