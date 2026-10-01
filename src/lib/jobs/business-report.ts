import { pool } from "../db";
import { config } from "../config";
import { reportError, sendAlert } from "../error-tracking";
import { kstDay } from "../metrics";
import { addDays, reportText, weekStart } from "../business";
import { getBusinessMetrics } from "../repo/business";

const LOCK_KEY = 4_823_040;
/** 월요일 이 시각(KST) 이후 첫 실행에서 보낸다 */
export const REPORT_HOUR_KST = 9;

export type ReportResult = { ran: boolean; week?: string; sentVia?: "email" | "webhook" | null; error?: string };

/** 지금 보낼 차례인 리포트의 주 시작일(지난주 월요일). 아직 월요일 9시 전이면 그 전 주 */
export function dueWeek(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const thisWeek = weekStart(kstDay(now));
  const isMondayBeforeHour = kst.getUTCDay() === 1 && kst.getUTCHours() < REPORT_HOUR_KST;
  return addDays(thisWeek, isMondayBeforeHour ? -14 : -7);
}

type Mail = { to: string; from: string; subject: string; text: string };
export type Sender = (mail: Mail) => Promise<void>;

/** Resend (https://resend.com) HTTP API — 의존성 없이 fetch 로 */
export const resendSender: Sender = async (mail) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: mail.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
};

/**
 * 지난주 리포트가 없으면 만들어 저장하고 보낸다. 여러 서버여도 advisory lock 으로 한 곳에서만.
 * 보낼 곳: RESEND_API_KEY 가 있으면 메일, 없으면 ALERT_WEBHOOK_URL, 둘 다 없으면 저장만 (/admin/business).
 */
export async function runBusinessReport(opts: { now?: Date; sender?: Sender } = {}): Promise<ReportResult> {
  const now = opts.now ?? new Date();
  const week = dueWeek(now);
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false };
    try {
      const exists = await client.query("SELECT 1 FROM biz_reports WHERE week_start = $1", [week]);
      if (exists.rowCount) return { ran: false, week };
      // 사이트가 열리기 전 주는 건너뛴다 (첫 배포 직후 빈 리포트가 가지 않게)
      const opened = await client.query(
        "SELECT 1 FROM visitors WHERE first_seen < ($1::date + 7)::timestamp AT TIME ZONE 'Asia/Seoul' LIMIT 1",
        [week],
      );
      if (!opened.rowCount) return { ran: false, week };

      const m = await getBusinessMetrics({ fresh: true, now });
      const label = `${week} ~ ${addDays(week, 6)}`;
      const { subject, text } = reportText(m, label, config.siteUrl);
      // 먼저 저장한다 — 전송이 실패해도 같은 주를 다시 보내느라 메일이 쌓이지 않게 (실패는 화면에 표시)
      await client.query("INSERT INTO biz_reports (week_start, body) VALUES ($1, $2)", [week, JSON.stringify({ subject, text, metrics: m })]);

      let sentVia: "email" | "webhook" | null = null;
      let error: string | undefined;
      try {
        const sender = opts.sender ?? (config.resendApiKey ? resendSender : null);
        if (sender && config.reportEmailTo) {
          await sender({ to: config.reportEmailTo, from: config.reportEmailFrom, subject, text });
          sentVia = "email";
        } else if (config.alertWebhookUrl) {
          if (await sendAlert(`${subject}\n\n${text}`)) sentVia = "webhook";
          else error = "웹훅 전송 실패";
        }
      } catch (e) {
        error = (e as Error).message.slice(0, 300);
      }
      await client.query("UPDATE biz_reports SET sent_via = $2, error = $3 WHERE week_start = $1", [week, sentVia, error ?? null]);
      return { ran: true, week, sentVia, ...(error ? { error } : {}) };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** server.ts 에서 호출 — 한 시간마다 확인해 지난주 리포트가 없으면 보낸다 */
export function startBusinessReportScheduler(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runBusinessReport();
      if (r.ran) console.log(`[business] ${r.week} 주간 리포트 — ${r.sentVia ?? "저장만"}${r.error ? ` (전송 실패: ${r.error})` : ""}`);
    } catch (err) {
      console.error("[business] report failed:", (err as Error).message);
      reportError(err, { kind: "job", where: "business-report" });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  // 서버가 막 떠서 바쁠 때를 피해 1분 뒤 첫 확인
  const first = setTimeout(tick, 60_000);
  first.unref();
  return () => {
    clearInterval(timer);
    clearTimeout(first);
  };
}
