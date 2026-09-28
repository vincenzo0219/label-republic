import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

// timestamptz → ISO 문자열 (서버 컴포넌트 → 클라이언트 컴포넌트 직렬화 안전). bigint(id)는 문자열 그대로.
types.setTypeParser(1184, (v) => new Date(v).toISOString());

// dev 모드 HMR에서도 커넥션 풀이 하나만 유지되도록 globalThis에 보관한다.
const g = globalThis as unknown as { __labelRepPool?: Pool };

export function pool(): Pool {
  if (!g.__labelRepPool) {
    const p = new Pool({ connectionString: config.databaseUrl, max: config.dbPoolMax });
    // DB 재시작·장애 조치 때 쉬고 있던 연결이 끊기며 오류 이벤트가 온다. 처리하지 않으면 uncaughtException 으로
    // 워커가 모두 죽는다 (Sprint 24 리허설에서 발견). 풀은 끊긴 연결을 버리고 다음 요청 때 새로 연결한다.
    p.on("error", (err) => console.warn("[db] 쉬던 연결이 끊겼습니다 (다음 요청 때 다시 연결):", err.message));
    g.__labelRepPool = p;
  }
  return g.__labelRepPool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
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
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres unique_violation */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
