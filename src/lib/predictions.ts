/**
 * 🎯 승부 예측 (11/2 대표님 "k리그, kbo, 게임 승부 예측 좋다. 보상은 배지, 그리고 스코어까지. 드라마 시청률 맞히기도 추가").
 * - 방마다 객관식 문제. 마감 전에 한 브라우저 한 표 (바꿀 수 없음). 결과는 운영 작업이 공식 결과를 확인하고 넣는다
 * - 맞히면 문제 점수(기본 10점). 연속으로 맞힌 수가 3 이상이면 닉네임 옆 배지 "🎯3연속" (코스피 맞히기는 "📈3연속")
 * - 순위: 이번 주(월요일 0시 KST부터) 점수. 닉네임을 남긴 사람만
 * 종목·베팅·돈 이야기는 없다 (놀이). 투자방 문제는 시장 전체 오르내림만.
 */

/** 방 탭 키 (?tab=predict) */
export const PREDICT_TAB = "predict";

/** 문제를 받는 방과 탭 이름 */
export const PREDICT_ROOMS: Record<string, { label: string; intro: string }> = {
  "k리그-덕후방": { label: "🎯 승부 예측", intro: "K리그 경기 결과를 맞혀요. 경기 시작 전에 마감돼요." },
  "kbo-덕후방": { label: "🎯 승부 예측", intro: "오늘 경기 승자를 맞혀요. 경기 시작 전에 마감돼요." },
  "게임-덕후방": { label: "🎯 승부 예측", intro: "LoL 월즈 같은 큰 경기 승자를 맞혀요." },
  "드라마-덕후방": { label: "🔮 다음 화 예측", intro: "다음 화 전개를 골라요. 공개 전에 마감, 스포일러는 없어요." }, // 11/2 대표님 "다음 화 예측으로 바꿔"
  미국주식방: { label: "📈 나스닥 맞히기", intro: "오늘 밤 나스닥 종가가 오를지 내릴지 골라요. 종목 이야기는 없어요." },
};

/** 배지가 붙는 연속 수 */
export const BADGE_STREAK = 3;
/** 순위에 보이는 사람 수 */
export const BOARD_TOP = 10;

export const isPredictRoom = (slug: string) => Object.hasOwn(PREDICT_ROOMS, slug);

/** 결과 난 판(최근 것부터 true/false)으로 연속 */
export function streakOf(recentFirst: readonly boolean[]): number {
  const miss = recentFirst.indexOf(false);
  return miss < 0 ? recentFirst.length : miss;
}

/** 닉네임 옆 배지 문구. 연속이 모자라면 없음 */
export function streakBadge(streak: number, icon = "🎯"): string | undefined {
  return streak >= BADGE_STREAK ? `${icon}${streak}연속` : undefined;
}

/** 이번 주 월요일 0시(KST)의 ISO */
export function weekStart(now = new Date()): string {
  const k = new Date(now.getTime() + 9 * 3600_000);
  const dow = (k.getUTCDay() + 6) % 7; // 월=0
  const mon = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow) - 9 * 3600_000;
  return new Date(mon).toISOString();
}

/** 운영자가 넣는 문제 검사. 문제 없으면 null */
export function predictionProblem(p: { room: string; title: string; options: string[]; closesAt: string }): string | null {
  if (!isPredictRoom(p.room)) return "예측 문제를 받는 방이 아니에요";
  if (!p.title.trim() || p.title.length > 120) return "제목은 1~120자";
  if (p.options.length < 2 || p.options.length > 6) return "보기는 2~6개";
  if (p.options.some((o) => !o.trim() || o.length > 30)) return "보기는 1~30자";
  if (new Set(p.options).size !== p.options.length) return "보기가 겹쳐요";
  if (!Number.isFinite(Date.parse(p.closesAt))) return "closesAt 시각을 확인하세요";
  return null;
}
