/** 🧩 새 타입 테스트 모음 (주소 /t/<key>). 방 놀이 탭 설정은 src/lib/roomPlay.ts */
import { cleanName } from "../friendLink";
import { BOARDGAME_TEST } from "./boardgame";
import { BOOK_TEST } from "./book";
import { CAMPING_TEST } from "./camping";
import { CAT_TEST } from "./cat";
import { DIET_TEST } from "./diet";
import type { TTType, TypeTest } from "./engine";
import { KBO_TEST } from "./kbo";
import { POPUP_TEST } from "./popup";
import { STAGE_TEST } from "./stage";
import { STOCK_TEST } from "./stock";
import { US_NIGHT_TEST } from "./usNight";

export const TYPE_TESTS: Record<string, TypeTest> = Object.fromEntries(
  [BOOK_TEST, KBO_TEST, STAGE_TEST, POPUP_TEST, BOARDGAME_TEST, CAT_TEST, DIET_TEST, CAMPING_TEST, STOCK_TEST, US_NIGHT_TEST].map((t) => [t.key, t]),
);

export const typeTestOf = (key: string | null | undefined): TypeTest | null => (key && Object.hasOwn(TYPE_TESTS, key) ? TYPE_TESTS[key]! : null);
export const typeOf = (test: TypeTest, key: string | null | undefined): TTType | null => test.types.find((t) => t.key === key) ?? null;

/** 링크 미리보기 카드 이름표 (/api/card/friend?test=t-<key>) */
export const CARD_PREFIX = "t-";

export type TypeTestCard = { emoji: string; kicker: string; headline: string; sub: string };

/**
 * 공유 링크 미리보기 글귀. ?m=타입&n=닉네임 이면 궁합 초대, ?r=타입 이면 결과 자랑, 아니면 테스트 소개.
 */
export function typeTestCard(test: TypeTest, q: URLSearchParams): TypeTestCard {
  const name = cleanName(q.get("n")) || "친구";
  const mate = typeOf(test, q.get("m"));
  if (mate) return { emoji: test.emoji, kicker: `${test.title} 궁합`, headline: `${name}님은 ${mate.emoji} ${mate.name}`, sub: "나는 어떤 타입일까? 1분 하고 궁합 보기" };
  const r = typeOf(test, q.get("r"));
  if (r) return { emoji: test.emoji, kicker: test.resultLabel, headline: `${r.emoji} ${r.name}`, sub: "나도 1분 만에 해 보기" };
  return { emoji: test.emoji, kicker: test.roomName, headline: `${test.emoji} ${test.title}`, sub: `질문 ${test.questions.length}개, 1분이면 나와요` };
}

export function typeTestCardUrl(test: TypeTest, q: URLSearchParams): string {
  const out = new URLSearchParams({ test: `${CARD_PREFIX}${test.key}` });
  for (const k of ["m", "r", "n"]) {
    const v = q.get(k);
    if (v) out.set(k, k === "n" ? cleanName(v) : v.slice(0, 30));
  }
  return `/api/card/friend?${out.toString()}`;
}
