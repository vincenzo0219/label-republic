import { query } from "../db";
import { kstDay } from "../metrics";

export type BookBite = { day: string; book: string; author: string; quote: string; verbatim: boolean; action: string; tries: number };

/** 오늘(한국 시간) 카드. 없으면 null — 방 화면은 카드 없이 그대로 */
export async function todayBite(now = new Date()): Promise<BookBite | null> {
  const rows = await query<BookBite>(
    `SELECT b.day::text, b.book, b.author, b.quote, b.verbatim, b.action, (SELECT count(*)::int FROM book_bite_tries t WHERE t.day = b.day) AS tries
       FROM book_bites b WHERE b.day = $1::date`,
    [kstDay(now)],
  );
  return rows[0] ?? null;
}

/** 운영자가 그날 카드를 넣거나 고친다 */
export async function setBite(b: Omit<BookBite, "tries">): Promise<void> {
  await query(
    `INSERT INTO book_bites (day, book, author, quote, verbatim, action) VALUES ($1::date, $2, $3, $4, $5, $6)
     ON CONFLICT (day) DO UPDATE SET book = EXCLUDED.book, author = EXCLUDED.author, quote = EXCLUDED.quote, verbatim = EXCLUDED.verbatim, action = EXCLUDED.action`,
    [b.day, b.book, b.author, b.quote, b.verbatim, b.action],
  );
}

/** "오늘 해 볼게요" — 오늘 카드에만, 사람마다 한 번. 지금까지 누른 사람 수를 돌려준다 */
export async function tryBite(fp: string, now = new Date()): Promise<number | null> {
  const day = kstDay(now);
  const rows = await query<{ n: number }>(
    `WITH ins AS (INSERT INTO book_bite_tries (day, fp) SELECT $1::date, $2 WHERE EXISTS (SELECT 1 FROM book_bites WHERE day = $1::date)
                   ON CONFLICT DO NOTHING RETURNING 1)
     SELECT ((SELECT count(*) FROM book_bite_tries WHERE day = $1::date) + (SELECT count(*) FROM ins))::int AS n
      WHERE EXISTS (SELECT 1 FROM book_bites WHERE day = $1::date)`,
    [day, fp],
  );
  return rows[0]?.n ?? null;
}
