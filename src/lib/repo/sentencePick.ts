/** 📖 어느 문장이 더 끌려요? 저장소 (11/2). 하루 한 쌍, 한 브라우저 한 표 (room_picks 를 board="sentence-pick" 으로 같이 쓴다) */
import { query } from "../db";
import { HttpError } from "../errors";
import { SENTENCE_BOARD, sentencePairOf, typeLabel } from "../sentencePick";

export type SentenceCard = { day: string; options: [string, string]; mine: 0 | 1 | null; counts: [number, number] | null; type: string | null };

async function counts(day: string): Promise<[number, number]> {
  const rows = await query<{ choice: string; c: number }>(
    "SELECT choice, count(*)::int AS c FROM room_picks WHERE board = $1 AND period = $2 GROUP BY choice",
    [SENTENCE_BOARD, day],
  );
  const out: [number, number] = [0, 0];
  for (const r of rows) if (r.choice === "0" || r.choice === "1") out[Number(r.choice)] = r.c;
  return out;
}

export async function sentenceCard(day: string, visitor: string | null): Promise<SentenceCard> {
  const pair = sentencePairOf(day);
  const [mine] = visitor
    ? await query<{ choice: string }>("SELECT choice FROM room_picks WHERE board = $1 AND period = $2 AND visitor_hash = $3", [SENTENCE_BOARD, day, visitor])
    : [];
  const m = mine?.choice === "0" ? 0 : mine?.choice === "1" ? 1 : null;
  return { day, options: pair.options, mine: m, counts: m === null ? null : await counts(day), type: m === null ? null : typeLabel(pair.types[m]) };
}

export async function pickSentence(day: string, visitor: string, choice: 0 | 1): Promise<SentenceCard> {
  if (choice !== 0 && choice !== 1) throw new HttpError(400, "invalid_input", "문장을 골라 주세요");
  await query(
    "INSERT INTO room_picks (board, period, visitor_hash, choice) VALUES ($1, $2, $3, $4) ON CONFLICT (board, period, visitor_hash) DO NOTHING",
    [SENTENCE_BOARD, day, visitor, String(choice)],
  );
  return sentenceCard(day, visitor);
}

export type SentenceStats = { today: number; total: number; days: { day: string; people: number; a: number; b: number }[] };

/** 📖 관리자 화면 (11/3 대표님 "진행"): 문장 고르기 오늘·누적 사람 수와 최근 7일 */
export async function sentenceStats(today: string, days = 7): Promise<SentenceStats> {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const [tot] = await query<{ total: number }>("SELECT count(DISTINCT visitor_hash)::int AS total FROM room_picks WHERE board = $1", [SENTENCE_BOARD]);
  const rows = await query<{ day: string; people: number; a: number; b: number }>(
    `SELECT period::text AS day, count(*)::int AS people, count(*) FILTER (WHERE choice = '0')::int AS a, count(*) FILTER (WHERE choice = '1')::int AS b
       FROM room_picks WHERE board = $1 AND period BETWEEN $2::date AND $3::date GROUP BY period ORDER BY period DESC`,
    [SENTENCE_BOARD, from, today],
  );
  return { today: rows.find((r) => r.day === today)?.people ?? 0, total: tot?.total ?? 0, days: rows };
}
