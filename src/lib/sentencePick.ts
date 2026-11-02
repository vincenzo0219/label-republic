/**
 * 📖 어느 문장이 더 끌려요? (11/2 대표님 "오른쪽처럼 바로 문장을 선택할 수 있게"): 💌 만남 행사 목록 사이에 문장 두 개 카드.
 * 문장은 📚 문장 취향 테스트(src/lib/typeTests/book.ts)의 12쌍을 날마다 하나씩 돌려 쓴다. 고르면 같은 문장 고른 비율과 그 문장의 취향이 보인다.
 * 1:1 연결·연락처는 없다 (결혼중개업법·개인정보, docs/research/2026-11-02_Readme_Hoppy_책소개팅.md)
 */
import { BOOK_TEST } from "./typeTests/book";

export const SENTENCE_BOARD = "sentence-pick";
/** 처음 쌍이 나온 날 (KST) */
const START = Date.UTC(2026, 10, 2);

export type SentencePair = { day: string; no: number; options: [string, string]; types: [string, string] };

/** 이 날(YYYY-MM-DD, KST)의 문장 쌍 */
export function sentencePairOf(day: string): SentencePair {
  const n = Math.round((Date.parse(`${day}T00:00:00Z`) - START) / 86_400_000);
  const qs = BOOK_TEST.questions;
  const i = ((n % qs.length) + qs.length) % qs.length;
  const q = qs[i]!;
  return { day, no: i, options: [q.options[0]!.label, q.options[1]!.label], types: [q.options[0]!.to[0]!, q.options[1]!.to[0]!] };
}

/** 타입 키 → "🌧️ 서정파" */
export function typeLabel(key: string): string {
  const t = BOOK_TEST.types.find((x) => x.key === key);
  return t ? `${t.emoji} ${t.name}` : "";
}
