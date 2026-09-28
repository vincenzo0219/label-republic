import { NextResponse } from "next/server";
import { dbDownSince, query } from "@/lib/db";
import { snapshotStats } from "@/lib/snapshots";
import { jobHealth } from "@/lib/repo/metrics";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

/**
 * GET /api/health — 로드밸런서·컨테이너 헬스체크
 * DB 연결과 마이그레이션 적용 여부를 확인하고, 실패하면 503.
 * ?deep=1 — 외부 모니터링용: 배치 작업의 마지막 실행·오류와 열린 서버 오류 수. 배치가 실패했거나 열린 오류가 있으면
 *           status 가 "degraded" (HTTP 는 200 — 로드밸런서가 서버를 빼지 않게)
 */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const headers = { "Cache-Control": "no-store" };
  try {
    const t0 = Date.now();
    const [m] = await query<{ latest: string | null; n: number }>(
      "SELECT max(name) AS latest, count(*)::int AS n FROM schema_migrations",
    );
    const base = { db: { ok: true, latencyMs: Date.now() - t0 }, migrations: m, uptimeSec: Math.round((Date.now() - startedAt) / 1000) };
    if (!deep) return NextResponse.json({ status: "ok", ...base }, { headers });
    const [jobs, errs] = await Promise.all([
      jobHealth(),
      query<{ open: number; last_hour: number }>(
        `SELECT count(*)::int AS open, count(*) FILTER (WHERE last_seen > now() - interval '1 hour')::int AS last_hour
           FROM error_events WHERE resolved_at IS NULL`,
      ),
    ]);
    // 오류 메시지 원문은 공개 엔드포인트에 내보내지 않는다 (대시보드에서 확인)
    const jobList = jobs.map((j) => ({ job: j.job, lastRun: j.started_at, finished: Boolean(j.finished_at), failed: Boolean(j.error) }));
    const degraded = jobList.some((j) => j.failed) || errs[0]!.last_hour > 0;
    return NextResponse.json({ status: degraded ? "degraded" : "ok", ...base, jobs: jobList, errors: errs[0] }, { headers });
  } catch (err) {
    console.error("[health]", (err as Error).message);
    // 읽기 전용 모드 (Sprint 27): 저장본 몇 개로 버티고 있는지
    const snaps = await snapshotStats().catch(() => ({ count: 0, newest: null }));
    const since = dbDownSince();
    return NextResponse.json(
      {
        status: "error",
        db: { ok: false, downSince: since ? new Date(since).toISOString() : null },
        readOnly: { snapshots: snaps.count, newest: snaps.newest ? new Date(snaps.newest).toISOString() : null },
      },
      { status: 503, headers },
    );
  }
}
