/**
 * 🥗 오늘 식단 인증 (10/24, 이용자가 만든 "다이어트 식단 함께해요." 방, id 140). 방 이름·설명·글은 그대로 둔다.
 * KST 하루 한 번, 같은 닉네임이면 같은 사람. 다시 보내면 그날 기록을 고친다.
 * 몸무게·신체 치수는 받지 않는다 (민감한 건강 정보). 의학적 효과를 말하는 문구는 쓰지 않는다.
 * 서버·클라이언트 공용 순수 함수.
 */
import { weekEnd, weekStart } from "./writingLog";

export const DIET_ROOM = "다이어트-식단-함께해요";
export const DIET_ROOMS: ReadonlySet<string> = new Set([DIET_ROOM]);
export const isDietRoom = (slug: string | null | undefined): boolean => !!slug && DIET_ROOMS.has(slug);

export const MEAL_NOTE_MAX = 40;
export const MEALS = [
  { key: "breakfast", label: "아침" },
  { key: "lunch", label: "점심" },
  { key: "dinner", label: "저녁" },
] as const;
export type Meal = (typeof MEALS)[number]["key"];
export const MEAL_ERROR = "아침·점심·저녁 중 하나는 골라 주세요.";

/** 고른 끼니를 아침·점심·저녁 순서로, 모르는 값과 중복은 뺀다 */
export function normalizeMeals(v: unknown): Meal[] {
  if (!Array.isArray(v)) return [];
  const set = new Set(v);
  return MEALS.filter((m) => set.has(m.key)).map((m) => m.key);
}

/** "3끼" 또는 "아침·저녁" */
export const mealWhat = (meals: readonly Meal[]) =>
  meals.length === MEALS.length ? "3끼" : MEALS.filter((m) => meals.includes(m.key)).map((m) => m.label).join("·");

const extras = (snack: boolean, note?: string | null) => `${snack ? " · 간식 참음 ✊" : ""}${note ? ` · ${note}` : ""}`;

/** 수다방에 올라가는 한 줄: "🥗 오늘 3끼 인증 · 연속 5일째 · 샐러드+닭가슴살" */
export const mealLine = (meals: readonly Meal[], streak: number, snack = false, note?: string | null): string =>
  `🥗 오늘 ${mealWhat(meals)} 인증 · 연속 ${streak}일째${extras(snack, note)}`;

/** 인증 목록 한 줄: "3끼 · 연속 5일 · 샐러드+닭가슴살" */
export const mealShort = (meals: readonly Meal[], streak: number, snack = false, note?: string | null): string =>
  `${mealWhat(meals)} · 연속 ${streak}일${extras(snack, note)}`;

export type DayRow = { author_key: string; nickname: string; day: string; at: string };
export type DaysTop = { author_key: string; nickname: string; days: number };

/** 이번 주(월~일, KST) 인증한 날이 많은 사람 n명. 동점이면 먼저 인증한 사람, 닉네임은 가장 최근 것 */
export function weeklyDaysTop(rows: readonly DayRow[], today: string, n = 5): DaysTop[] {
  const from = weekStart(today);
  const to = weekEnd(today);
  const m = new Map<string, DaysTop & { seen: Set<string>; first: string; last: string }>();
  for (const r of rows) {
    if (r.day < from || r.day > to) continue;
    let cur = m.get(r.author_key);
    if (!cur) m.set(r.author_key, (cur = { author_key: r.author_key, nickname: r.nickname, days: 0, seen: new Set(), first: r.at, last: r.day }));
    if (!cur.seen.has(r.day)) {
      cur.seen.add(r.day);
      cur.days++;
    }
    if (r.at < cur.first) cur.first = r.at;
    if (r.day >= cur.last) {
      cur.last = r.day;
      cur.nickname = r.nickname;
    }
  }
  return [...m.values()]
    .sort((a, b) => b.days - a.days || a.first.localeCompare(b.first))
    .slice(0, n)
    .map(({ author_key, nickname, days }) => ({ author_key, nickname, days }));
}

/**
 * 이 방에서 바로 가리는 분명한 표현 (규칙). 굶기 챌린지·먹토·식욕억제제 거래·프로아나.
 * 애매한 글은 Claude 판단(DIET_MODERATION_PROMPT)에 맡긴다.
 */
const DIET_RULES: RegExp[] = [
  /먹\s*토|먹\s*뱉|씹\s*뱉|토하는\s*(?:법|방법)|억지로\s*토/,
  /프로\s*아나|아나\s*(?:메이트|친구|방)|뼈\s*말라\s*(?:자극|챌린지|목표|되[고자기]|될)|개\s*말라\s*(?:자극|챌린지|목표)/,
  /(?:다이어트\s*약|살\s*빼는\s*약|식욕\s*억제제|나비\s*약|펜터민|디에타민|큐시미아|변비약|이뇨제)\s*\S{0,12}?\s*(?:팝니다|팔아요|판매|구매|구해요|구합니다|드려요|나눔|양도|처방\s*없이|직구|대리\s*처방)/,
  /(?:단식|굶기|금식|물\s*단식|절식)\s*[2-9]\d*\s*일\s*(?:째|차)?\s*(?:챌린지|도전|같이|함께|인증)|[2-9]\d*\s*일\s*(?:동안\s*)?(?:단식|굶기|금식)\s*(?:챌린지|도전|같이|함께)/,
];

/** 이 방 규칙에 걸리면 걸린 부분, 아니면 null. 다른 방은 언제나 null */
export function dietProblem(slug: string | null | undefined, ...texts: (string | null | undefined)[]): string | null {
  if (!isDietRoom(slug)) return null;
  const text = texts.filter(Boolean).join("\n").normalize("NFC");
  for (const re of DIET_RULES) {
    const m = re.exec(text);
    if (m) return m[0].slice(0, 40);
  }
  return null;
}

/** AI 운영에 덧붙이는 식단방 기준 */
export const DIET_MODERATION_PROMPT = `이 글은 다이어트 식단을 함께 기록하는 방에 올라왔습니다. 다음에 해당하면 category "diet" 로 판단합니다.
- 며칠씩 굶기·단식·초절식을 같이 하자는 챌린지, 극단적으로 적게 먹으라고 부추기는 글
- 먹고 토하기("먹토")·씹고 뱉기·설사약·이뇨제로 살 빼기를 권하거나 방법을 알려 주는 글
- 다이어트약·식욕억제제를 팔거나 처방 없이 구해 준다는 글
- 섭식장애를 미화하거나 부추기는 글 (프로아나, "뼈말라 자극" 등)
본인의 식단 기록, 운동 기록, 레시피, 힘들다는 고민, 섭식장애를 걱정하거나 도움을 구하는 글은 none 입니다.`;
