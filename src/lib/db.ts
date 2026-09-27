import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

// timestamptz → ISO 문자열 (서버 컴포넌트 → 클라이언트 컴포넌트 직렬화 안전). bigint(id)는 문자열 그대로.
types.setTypeParser(1184, (v) => new Date(v).toISOString());

// dev 모드 HMR에서도 커넥션 풀이 하나만 유지되도록 globalThis에 보관한다.
const g = globalThis as unknown as { __labelRepPool?: Pool };

export function pool(): Pool {
  if (!g.__labelRepPool) {
    g.__labelRepPool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }
  return g.__labelRepPool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
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
