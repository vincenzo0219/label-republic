import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

/**
 * GET /api/health — 로드밸런서·컨테이너 헬스체크
 * DB 연결과 마이그레이션 적용 여부를 확인하고, 실패하면 503.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const t0 = Date.now();
    const [m] = await query<{ latest: string | null; n: number }>(
      "SELECT max(name) AS latest, count(*)::int AS n FROM schema_migrations",
    );
    return NextResponse.json(
      { status: "ok", db: { ok: true, latencyMs: Date.now() - t0 }, migrations: m, uptimeSec: Math.round((Date.now() - startedAt) / 1000) },
      { headers },
    );
  } catch (err) {
    console.error("[health]", (err as Error).message);
    return NextResponse.json({ status: "error", db: { ok: false } }, { status: 503, headers });
  }
}
