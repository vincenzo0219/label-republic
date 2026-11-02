/**
 * 🧩 설정으로 만드는 타입 테스트 엔진 (11/2 대표님 "전부 탭 새로 추가해서 전부 다 진행").
 * 테스트 하나 = 질문 5~12개(보기 2~4개) + 타입 4~10개. 보기를 고르면 적힌 타입에 1점씩, 가장 높은 타입이 결과
 * (같으면 types 배열 앞쪽). 궁합표는 타입 짝에서 정해진 규칙으로 만든다 (재미용. 설문·통계가 아니다).
 * 서버·브라우저·테스트 공용 순수 함수만. 설정은 JSON 으로 넘길 수 있는 값만 (함수 없음).
 */

export type TTType = { key: string; emoji: string; name: string; what: string };
export type TTOption = { label: string; to: readonly string[] };
export type TTQuestion = { q: string; options: readonly TTOption[] };

export type TypeTest = {
  /** 주소 /t/<key> */
  key: string;
  /** 이 테스트를 보여 주는 방 */
  room: string;
  roomName: string;
  emoji: string;
  title: string;
  /** 결과 위 작은 글 ("나의 문장 취향") */
  resultLabel: string;
  /** 첫 화면 한 줄 */
  intro: string;
  /** 링크 미리보기 설명 */
  description: string;
  questions: readonly TTQuestion[];
  types: readonly TTType[];
  /** 결과 아래 꼭 붙는 안내 (종목 추천 아님 등) */
  note?: string;
  /** 보기가 긴 글이면 한 줄에 하나씩 */
  long?: boolean;
};

export type Compat = { pct: number; line: string };

export const pairKey = (a: string, b: string) => (a <= b ? `${a}|${b}` : `${b}|${a}`);

/** 고른 보기 번호들 → 타입별 점수 */
export function scoreAnswers(test: TypeTest, answers: readonly number[]): Record<string, number> {
  const s: Record<string, number> = Object.fromEntries(test.types.map((t) => [t.key, 0]));
  test.questions.forEach((q, i) => {
    const o = q.options[answers[i] ?? -1];
    if (o) for (const k of o.to) if (k in s) s[k]! += 1;
  });
  return s;
}

/** 결과 타입 (같은 점수면 types 배열 앞쪽). 답 수가 모자라거나 범위 밖이면 null */
export function pickType(test: TypeTest, answers: readonly number[]): TTType | null {
  if (answers.length !== test.questions.length) return null;
  if (answers.some((a, i) => !Number.isInteger(a) || a < 0 || a >= test.questions[i]!.options.length)) return null;
  const s = scoreAnswers(test, answers);
  let best = test.types[0]!;
  for (const t of test.types) if (s[t.key]! > s[best.key]!) best = t;
  return best;
}

/** 문자열 → 0 이상 정수 (FNV-1a). 궁합표를 매번 같게 만들려고 */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const SAME_LINES = ["같은 타입이에요. 말 안 해도 통해요.", "취향 복사본을 만났어요. 추천이 실패할 일이 없어요.", "같은 타입끼리라 고르는 데 1초면 돼요."];
const HIGH_LINES = ["서로 비슷한데 조금씩 달라요. 추천을 주고받기 좋은 사이예요.", "같이 하면 시간 가는 줄 몰라요.", "한 명이 시작하면 한 명이 이어 가는 짝이에요."];
const MID_LINES = ["다른 점이 많아서 오히려 새로워요.", "서로의 취향을 하나씩 바꿔 해 보세요. 의외로 잘 맞아요.", "한 명은 앞에서, 한 명은 옆에서 챙기는 사이예요."];
const LOW_LINES = ["취향은 달라도 같이 하면 새 세계가 열려요.", "서로 낯선 쪽을 소개해 주기 좋은 사이예요.", "처음엔 어색해도 이야깃거리는 제일 많아요."];

/** 두 타입의 궁합 (순서 상관없이 같은 값). 같은 타입 88~95, 다른 타입 62~94 */
export function compatOf(testKey: string, a: string, b: string): Compat {
  const k = pairKey(a, b);
  const h = hash(`${testKey}:${k}`);
  if (a === b) return { pct: 88 + (h % 8), line: SAME_LINES[h % SAME_LINES.length]! };
  const pct = 62 + (h % 33);
  const lines = pct >= 85 ? HIGH_LINES : pct >= 74 ? MID_LINES : LOW_LINES;
  return { pct, line: lines[(h >>> 8) % lines.length]! };
}

/** 테스트의 궁합표 전체 (짝 키 → 궁합) */
export function compatTable(test: TypeTest): Record<string, Compat> {
  const out: Record<string, Compat> = {};
  test.types.forEach((a, i) => test.types.slice(i).forEach((b) => (out[pairKey(a.key, b.key)] = compatOf(test.key, a.key, b.key))));
  return out;
}

/** 설정 검사. 문제 목록 (비면 통과) */
export function testProblems(test: TypeTest): string[] {
  const p: string[] = [];
  const keys = new Set(test.types.map((t) => t.key));
  if (!/^[a-z0-9-]{2,30}$/.test(test.key)) p.push("key 는 영소문자·숫자·- 2~30자");
  if (keys.size !== test.types.length) p.push("타입 키가 겹쳐요");
  if (test.types.length < 4 || test.types.length > 10) p.push("타입은 4~10개");
  if (test.questions.length < 5 || test.questions.length > 12) p.push("질문은 5~12개");
  test.questions.forEach((q, i) => {
    if (q.options.length < 2 || q.options.length > 4) p.push(`${i + 1}번 보기는 2~4개`);
    for (const o of q.options) for (const k of o.to) if (!keys.has(k)) p.push(`${i + 1}번 보기에 없는 타입 ${k}`);
  });
  const all = [test.title, test.intro, test.description, test.note ?? "", ...test.types.flatMap((t) => [t.name, t.what]), ...test.questions.flatMap((q) => [q.q, ...q.options.map((o) => o.label)])];
  if (all.some((s) => s.includes("—"))) p.push("긴 줄표(—)는 쓰지 않아요");
  return p;
}

/** 나올 수 있는 타입 (모든 답 조합을 돌려 본다. 조합이 너무 많으면 앞에서 limit 개까지) */
export function reachableTypes(test: TypeTest, limit = 2_000_000): Set<string> {
  const n = test.questions.map((q) => q.options.length);
  const seen = new Set<string>();
  const a = n.map(() => 0);
  for (let c = 0; c < limit; c++) {
    seen.add(pickType(test, a)!.key);
    if (seen.size === test.types.length) break;
    let i = a.length - 1;
    while (i >= 0 && ++a[i]! === n[i]) a[i--] = 0;
    if (i < 0) break;
  }
  return seen;
}

/** 분포 한 줄. 실제로 센 값만 쓴다 */
export function sameTypeLine(same: number, total: number): string {
  if (total <= 0) return "";
  if (total < 10) return `지금까지 ${total}명이 했어요. 나와 같은 타입은 ${same}명이에요.`;
  return `이 테스트를 한 ${total.toLocaleString("ko-KR")}명 중 ${Math.round((same / total) * 100)}%가 같은 타입이에요.`;
}
