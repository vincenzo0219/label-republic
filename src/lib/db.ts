import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

// timestamptz → ISO 문자열 (서버 컴포넌트 → 클라이언트 컴포넌트 직렬화 안전). bigint(id)는 문자열 그대로.
types.setTypeParser(1184, (v) => new Date(v).toISOString());

// dev 모드 HMR에서도 커넥션 풀이 하나만 유지되도록 globalThis에 보관한다.
// DB 상태(아래)도 globalThis — server.ts 와 Next 가 번들한 라우트 코드는 이 모듈을 따로 불러오므로 같은 값을 보려면 여기 둬야 한다.
type DbState = { down: boolean; since: number | null; probe: ReturnType<typeof setInterval> | null; lastError: string | null };
const g = globalThis as unknown as { __labelRepPool?: Pool; __labelRepDb?: DbState };
const state = (): DbState => (g.__labelRepDb ??= { down: false, since: null, probe: null, lastError: null });

/**
 * DB에 닿지 못한 오류인가 (연결 거부·끊김·시간 초과·DB 종료 중). 쿼리 자체의 오류(문법·제약 위반·취소)는 아니다.
 * 이런 오류가 나면 "DB 장애"로 보고 읽기 전용 모드로 바꾼다 (Sprint 27).
 */
export function isConnectionError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; message?: string };
  if (e.code && /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|EPIPE)$/.test(e.code)) return true;
  // 08xxx connection_exception, 57P01~03 admin_shutdown / crash_shutdown / cannot_connect_now
  if (e.code && /^(08\d{3}|08P01|57P0[123])$/.test(e.code)) return true;
  // 메시지로 판단하는 것은 코드가 없는 오류(pg 드라이버가 낸 것)만 — Postgres 오류 메시지에 이용자 입력이 섞여
  // "Connection terminated" 같은 말로 읽기 전용 모드를 켜지 못하게 (Sprint 29)
  if (e.code) return false;
  return /Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error|connect ECONNREFUSED/i.test(e.message ?? "");
}

/** 지금 DB 에 닿지 못하는 상태인가 (연결 오류를 본 뒤, 확인 쿼리가 성공할 때까지) */
export function dbDown(): boolean {
  return state().down;
}
export function dbDownSince(): number | null {
  return state().since;
}

export function markDbDown(err: unknown) {
  const s = state();
  s.lastError = err instanceof Error ? err.message : String(err);
  if (s.down) return;
  s.down = true;
  s.since = Date.now();
  console.error(`[db] DB 에 연결할 수 없습니다 — 읽기 전용 모드 (${s.lastError})`);
  // 2초마다 확인해 돌아오면 바로 정상 모드로
  s.probe = setInterval(() => {
    pool()
      .query("SELECT 1")
      .then(() => markDbUp())
      .catch(() => {});
  }, 2000);
  s.probe.unref?.();
}

export function markDbUp() {
  const s = state();
  if (!s.down) return;
  console.log(`[db] DB 연결이 돌아왔습니다 (${Math.round((Date.now() - (s.since ?? Date.now())) / 1000)}초 만에)`);
  s.down = false;
  s.since = null;
  if (s.probe) clearInterval(s.probe);
  s.probe = null;
}

function watch<T>(p: Promise<T>): Promise<T> {
  return p.then(
    (v) => {
      if (state().down) markDbUp();
      return v;
    },
    (err) => {
      if (isConnectionError(err)) markDbDown(err);
      throw err;
    },
  );
}

export function pool(): Pool {
  if (!g.__labelRepPool) {
    const p = new Pool({ connectionString: config.databaseUrl, max: config.dbPoolMax, connectionTimeoutMillis: config.dbConnectTimeoutMs });
    // DB 재시작·장애 조치 때 쉬고 있던 연결이 끊기며 오류 이벤트가 온다. 처리하지 않으면 uncaughtException 으로
    // 워커가 모두 죽는다 (Sprint 24 리허설에서 발견). 풀은 끊긴 연결을 버리고 다음 요청 때 새로 연결한다.
    p.on("error", (err) => console.warn("[db] 쉬던 연결이 끊겼습니다 (다음 요청 때 다시 연결):", err.message));
    g.__labelRepPool = p;
  }
  return g.__labelRepPool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await watch(pool().query<T>(text, params));
  return res.rows;
}

/** Postgres query_canceled (statement_timeout 초과 포함) */
export function isQueryCanceled(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "57014";
}

/**
 * 실행 시간 상한을 걸고 조회한다 (검색처럼 입력에 따라 비용이 크게 달라지는 쿼리용).
 * 넘으면 Postgres가 쿼리를 취소하고 isQueryCanceled(err) 인 오류를 던진다.
 */
export async function queryWithTimeout<T extends QueryResultRow>(
  timeoutMs: number,
  text: string,
  params: unknown[] = [],
  opts: { noParallel?: boolean } = {},
): Promise<T[]> {
  return tx(async (client) => {
    await client.query(`SET LOCAL statement_timeout = ${Math.max(1, Math.floor(timeoutMs))}`);
    // LIMIT 이 있는 쿼리에서 병렬 워커는 필요 이상으로 앞서 읽어 동시 요청이 많을 때 오히려 CPU를 낭비한다
    if (opts.noParallel) await client.query("SET LOCAL max_parallel_workers_per_gather = 0");
    return (await client.query<T>(text, params)).rows;
  });
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await watch(pool().connect());
  // 끊긴 연결은 풀에 돌려주지 않고 버린다 (release(err))
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    if (isConnectionError(err)) {
      markDbDown(err);
      broken = err as Error;
      throw err;
    }
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      if (isConnectionError(rollbackErr)) {
        markDbDown(rollbackErr);
        broken = rollbackErr as Error;
      }
    }
    throw err;
  } finally {
    client.release(broken);
  }
}

/** Postgres unique_violation */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
