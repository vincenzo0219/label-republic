/** 🧩 타입 테스트 결과·📚 행사 책 취향 저장소 (121). 둘 다 익명 (방문자 쿠키 해시) */
import { query } from "../db";
import { HttpError, notFound } from "../errors";
import { cleanPicks, tasteBoard, type TasteBoard } from "../bookTaste";
import { pickType } from "../typeTests/engine";
import { typeTestOf } from "../typeTests";

export type TypeDist = { total: number; counts: Record<string, number> };
export type SavedResult = TypeDist & { type: string; same: number };

export async function typeDistribution(testKey: string): Promise<TypeDist> {
  const test = typeTestOf(testKey);
  if (!test) throw notFound("테스트");
  const rows = await query<{ type_key: string; c: number }>("SELECT type_key, count(*)::int AS c FROM type_test_results WHERE test_key = $1 GROUP BY type_key", [testKey]);
  const counts: Record<string, number> = Object.fromEntries(test.types.map((t) => [t.key, 0]));
  for (const r of rows) if (r.type_key in counts) counts[r.type_key] = r.c;
  return { total: Object.values(counts).reduce((a, b) => a + b, 0), counts };
}

/** 답(보기 번호들)을 받아 서버가 다시 채점해 저장한다. 같은 브라우저는 마지막 결과로 바뀐다 */
export async function saveTypeResult(testKey: string, visitor: string, answers: readonly number[]): Promise<SavedResult> {
  const test = typeTestOf(testKey);
  if (!test) throw notFound("테스트");
  const t = pickType(test, answers);
  if (!t) throw new HttpError(400, "invalid_input", "모든 질문에 답해 주세요");
  await query(
    `INSERT INTO type_test_results (test_key, visitor_hash, type_key) VALUES ($1, $2, $3)
     ON CONFLICT (test_key, visitor_hash) DO UPDATE SET type_key = EXCLUDED.type_key, updated_at = now()`,
    [testKey, visitor, t.key],
  );
  const dist = await typeDistribution(testKey);
  return { ...dist, type: t.key, same: dist.counts[t.key] ?? 0 };
}

export async function bookTasteBoard(visitor: string | null): Promise<TasteBoard> {
  const [agg] = await query<{ n: number }>("SELECT count(*)::int AS n FROM event_book_tastes");
  const rows = await query<{ k: string; c: number }>("SELECT k, count(*)::int AS c FROM event_book_tastes, unnest(picks) AS k GROUP BY k");
  const mine = visitor ? (await query<{ picks: string[] }>("SELECT picks FROM event_book_tastes WHERE visitor_hash = $1", [visitor]))[0]?.picks ?? [] : [];
  return tasteBoard(Object.fromEntries(rows.map((r) => [r.k, r.c])), agg?.n ?? 0, mine);
}

export async function saveBookTaste(visitor: string, picks: unknown): Promise<TasteBoard> {
  const clean = cleanPicks(picks);
  if (!clean) throw new HttpError(400, "invalid_input", "목록에서 1~3개 골라 주세요");
  await query(
    `INSERT INTO event_book_tastes (visitor_hash, picks) VALUES ($1, $2)
     ON CONFLICT (visitor_hash) DO UPDATE SET picks = EXCLUDED.picks, updated_at = now()`,
    [visitor, clean],
  );
  return bookTasteBoard(visitor);
}
