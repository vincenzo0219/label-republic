import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, guardJob, REPORT_AFTER_FAILURES, resetJobsStopping, stopAllJobs } from "@/lib/jobs/guard";
import { createShutdown, markDraining, markReady, resetPhase, serverPhase } from "@/lib/lifecycle";

// 무중단 배포 (10/25): 배치 보호막 · 종료 처리 · health 준비 상태

const connErr = () => Object.assign(new Error("timeout exceeded when trying to connect"));

function harness() {
  let now = 1_000_000;
  const reports: string[] = [];
  const logs: string[] = [];
  const deps = {
    now: () => now,
    report: (_e: unknown, where: string) => void reports.push(where),
    log: (m: string) => void logs.push(m),
  };
  return { deps, reports, logs, advance: (ms: number) => (now += ms) };
}

describe("guardJob", () => {
  afterEach(() => resetJobsStopping());

  it("backs off on DB connection errors and reports only once a streak is persistent", async () => {
    const h = harness();
    const fn = vi.fn().mockRejectedValue(connErr());
    const tick = guardJob("welcome", fn, h.deps);

    await tick();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(h.reports).toEqual([]); // 한 번 끊긴 것은 서버 오류로 남기지 않는다
    expect(tick.state().nextAt).toBeGreaterThan(0);

    // 기다리는 동안의 tick 은 DB 에 손대지 않는다
    await tick();
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);

    h.advance(BACKOFF_BASE_MS);
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
    h.advance(BACKOFF_BASE_MS); // 두 번째는 1분을 기다려야 한다
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
    h.advance(BACKOFF_BASE_MS);
    await tick();
    expect(fn).toHaveBeenCalledTimes(3);
    expect(h.reports).toEqual(["welcome"]); // 3번째 연속 실패에 한 번
    for (let i = 0; i < 10; i++) {
      h.advance(BACKOFF_MAX_MS);
      await tick();
    }
    expect(h.reports).toEqual(["welcome"]); // 장애가 이어져도 다시 쌓이지 않는다
    expect(tick.state().failures).toBe(REPORT_AFTER_FAILURES + 10);
    expect(tick.state().nextAt - 1_000_000).toBeLessThanOrEqual(BACKOFF_MAX_MS * 11 + BACKOFF_BASE_MS * 3);

    // 돌아오면 바로 정상
    fn.mockResolvedValue(undefined);
    h.advance(BACKOFF_MAX_MS);
    await tick();
    expect(tick.state()).toMatchObject({ failures: 0, nextAt: 0 });
    expect(h.logs.some((l) => l.includes("돌아와"))).toBe(true);
  });

  it("still reports code errors every time without backing off", async () => {
    const h = harness();
    const fn = vi.fn().mockRejectedValue(new TypeError("x is undefined"));
    const tick = guardJob("trust", fn, h.deps);
    await tick();
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(h.reports).toEqual(["trust", "trust"]);
  });

  it("does not overlap runs", async () => {
    const h = harness();
    let release!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => (release = r)));
    const tick = guardJob("push", fn, h.deps);
    const first = tick();
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);
    release();
    await first;
    void tick(); // 앞 실행이 끝났으니 다시 돈다
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("starts nothing and reports nothing once shutdown began", async () => {
    const h = harness();
    let reject!: (e: Error) => void;
    const fn = vi.fn(() => new Promise<void>((_, r) => (reject = r)));
    const tick = guardJob("maintenance", fn, h.deps);
    const running = tick();
    stopAllJobs();
    reject(new Error("Cannot use a pool after calling end on the pool"));
    await running;
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(h.reports).toEqual([]);
  });
});

describe("createShutdown", () => {
  let server: Server;
  let port: number;
  let releaseSlow: (() => void) | null = null;

  beforeEach(async () => {
    resetPhase();
    releaseSlow = null;
    server = createServer((req, res) => {
      if (req.url === "/slow") {
        releaseSlow = () => res.end("slow-done");
        return;
      }
      res.end("ok");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterEach(() => {
    server.close();
  });
  afterAll(() => resetPhase());

  const get = (path: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path, agent: false }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on("error", reject);
      req.end();
    });

  it("stops jobs, finishes in-flight requests, refuses new ones, then closes the pool and exits 0", async () => {
    markReady();
    const order: string[] = [];
    const exit = vi.fn();
    const shutdown = createShutdown({
      server,
      stopJobs: () => order.push("jobs"),
      beforeClose: () => order.push("sockets"),
      afterClose: async () => void order.push("pool"),
      exit,
      log: () => {},
    });

    const inflight = get("/slow");
    await vi.waitFor(() => expect(releaseSlow).not.toBeNull());
    const done = shutdown("SIGTERM");
    expect(serverPhase()).toBe("draining");
    expect(order).toEqual(["jobs", "sockets"]);
    // 새 연결은 받지 않는다
    await expect(get("/")).rejects.toThrow();
    // 진행 중 요청은 끝까지 응답받는다
    expect(exit).not.toHaveBeenCalled();
    releaseSlow!();
    expect(await inflight).toEqual({ status: 200, body: "slow-done" });
    await done;
    expect(order).toEqual(["jobs", "sockets", "pool"]);
    expect(exit).toHaveBeenCalledWith(0);
    // 두 번째 신호는 같은 처리를 돌려준다
    expect(shutdown("SIGINT")).toBe(done);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("forces exit(1) when in-flight work does not finish in time", async () => {
    const exit = vi.fn();
    const shutdown = createShutdown({ server, exit, timeoutMs: 50, log: () => {} });
    const inflight = get("/slow").catch(() => null);
    await vi.waitFor(() => expect(releaseSlow).not.toBeNull());
    await shutdown("SIGTERM");
    expect(exit).toHaveBeenCalledWith(1);
    releaseSlow!();
    await inflight;
  });
});

describe("GET /api/health readiness", () => {
  afterAll(() => resetPhase());
  it("answers 503 draining without touching the DB once shutdown began", async () => {
    const { GET } = await import("@/app/api/health/route");
    markDraining();
    const res = await GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "draining" });
  });

  const url = process.env.TEST_DATABASE_URL;
  (url ? it : it.skip)("answers 200 ok with migrations when ready", async () => {
    process.env.DATABASE_URL = url;
    resetPhase();
    markReady();
    const { GET } = await import("@/app/api/health/route");
    const { query } = await import("@/lib/db");
    await query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())");
    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db.ok).toBe(true);
  });
});
