/**
 * 📅 오늘의 문제 (Sprint 66) — 매일 0시(KST)에 첫 문장 한 문제 + 황금귀 한 문제가 새로 열린다.
 * 한 번 하면 끝나는 테스트만으로는 다시 올 이유가 없어서(재방문율 9%), Wordle처럼 하루 한 번·연속 기록을 둔다.
 * 첫 문장은 첫 문장 테스트(10문제)와 겹치지 않는 저작권이 끝난 작품만 — 외국 작품은 원문에서 직접 옮겼다.
 * 황금귀 문제는 황금귀 테스트의 10쌍을 날짜마다 돌아가며 쓴다 (원본 쪽은 매번 무작위).
 */
import { EAR_ROUNDS, type EarRound } from "./earTest";
import type { FirstLineQuestion } from "./firstLineTest";

/** 첫 회 날짜 (KST) — 문제 번호는 이날부터 센다 */
export const DAILY_START = "2026-10-15";

export const DAILY_LINES: readonly FirstLineQuestion[] = [
  { line: "아이들은 모두 자란다. 단 한 아이만 빼고.", answer: "피터 팬", author: "제임스 매슈 배리", others: ["오즈의 마법사", "어린 왕자", "정글 북"] },
  { line: "그는 멕시코 만류에서 조각배를 타고 혼자 고기를 잡는 노인이었고, 고기 한 마리 못 잡은 날이 이제 여든나흘째였다.", answer: "노인과 바다", author: "어니스트 헤밍웨이", others: ["모비 딕", "무기여 잘 있거라", "해는 또다시 떠오른다"] },
  { line: "이름까지 기억하고 싶지는 않은 라만차의 어느 마을에, 얼마 전까지 한 시골 귀족이 살고 있었다.", answer: "돈키호테", author: "미겔 데 세르반테스", others: ["걸리버 여행기", "로빈슨 크루소", "캉디드"] },
  { line: "새침하게 흐린 품이 눈이 올 듯하더니, 눈은 아니 오고 얼다가 만 비가 추적추적 내리는 날이었다.", answer: "운수 좋은 날", author: "현진건", others: ["빈처", "감자", "B사감과 러브레터"] },
  { line: "그날은 산책을 할 수 없었다.", answer: "제인 에어", author: "샬럿 브론테", others: ["오만과 편견", "폭풍의 언덕", "설득"] },
  { line: "떠나오길 얼마나 잘했는지 모르겠네!", answer: "젊은 베르테르의 슬픔", author: "요한 볼프강 폰 괴테", others: ["파우스트", "데미안", "수레바퀴 아래서"] },
  { line: "도로시는 캔자스의 넓은 대초원 한가운데에서 농부인 헨리 아저씨, 엠 아주머니와 함께 살았다.", answer: "오즈의 마법사", author: "L. 프랭크 바움", others: ["피터 팬", "하이디", "이상한 나라의 앨리스"] },
  { line: "7월 초, 몹시 무더운 어느 저녁 무렵, 한 청년이 S골목의 하숙방에서 거리로 나와 망설이는 듯 천천히 K다리 쪽으로 걸어갔다.", answer: "죄와 벌", author: "표도르 도스토옙스키", others: ["백치", "카라마조프가의 형제들", "지하로부터의 수기"] },
  { line: "여름 장이란 애시당초에 글러서, 해는 아직 중천에 있건만 장판은 벌써 쓸쓸하고 더운 햇발이 벌여 놓은 전 휘장 밑으로 등줄기를 훅훅 볶는다.", answer: "메밀꽃 필 무렵", author: "이효석", others: ["동백꽃", "봄봄", "소나기"] },
  { line: "\"선물 없는 크리스마스는 크리스마스가 아니야.\" 조가 양탄자 위에 누운 채 투덜거렸다.", answer: "작은 아씨들", author: "루이자 메이 올컷", others: ["빨강 머리 앤", "비밀의 화원", "키다리 아저씨"] },
  { line: "변호사 어터슨 씨는 웃는 얼굴을 좀처럼 볼 수 없는, 무뚝뚝한 인상의 사내였다.", answer: "지킬 박사와 하이드 씨", author: "로버트 루이스 스티븐슨", others: ["드라큘라", "프랑켄슈타인", "도리언 그레이의 초상"] },
  { line: "앨리스는 언니 옆 강둑에 앉아 있었는데, 아무것도 할 일이 없어서 점점 지루해지기 시작했다.", answer: "이상한 나라의 앨리스", author: "루이스 캐럴", others: ["오즈의 마법사", "피터 팬", "비밀의 화원"] },
  { line: "나는 내 안에서 저절로 솟아 나오려는 것, 바로 그것을 살아 보려 했을 뿐이다. 그것이 왜 그토록 어려웠을까?", answer: "데미안", author: "헤르만 헤세", others: ["수레바퀴 아래서", "싯다르타", "황야의 이리"] },
  { line: "싸움, 간통, 살인, 도둑, 구걸, 징역, 이 세상의 모든 비극과 활극의 근원지인 칠성문 밖 빈민굴로 오기 전까지는, 복녀의 부처는 농민이었었다.", answer: "감자", author: "김동인", others: ["배따라기", "운수 좋은 날", "광염 소나타"] },
  { line: "레이철 린드 부인은 에이번리 큰길이 작은 골짜기로 내려가는 바로 그 자리에 살고 있었다.", answer: "빨강 머리 앤", author: "루시 모드 몽고메리", others: ["작은 아씨들", "키다리 아저씨", "하이디"] },
];

export type DailyKind = "line" | "ear";
export const DAILY_KINDS: readonly DailyKind[] = ["line", "ear"];

/** 첫 회부터 며칠째인지 (0부터). 첫 회 전이면 0 */
export function dailyNumber(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`) - Date.parse(`${DAILY_START}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export type DailySet = { day: string; no: number; line: FirstLineQuestion; ear: EarRound };

export function dailySet(day: string): DailySet {
  const n = dailyNumber(day);
  return { day, no: n + 1, line: DAILY_LINES[n % DAILY_LINES.length]!, ear: EAR_ROUNDS[n % EAR_ROUNDS.length]! };
}

/** 푼 날짜 목록으로 오늘(또는 어제)까지 이어진 연속 일수. 오늘 아직 안 풀었으면 어제까지를 센다 */
export function streakOf(days: readonly string[], today: string): number {
  const set = new Set(days);
  const prev = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  let d = set.has(today) ? today : prev(today);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = prev(d);
  }
  return n;
}

/** 공유 한 줄 — 정답을 드러내지 않게 ⭕/❌ 만 */
export function dailyShareLine(no: number, line: boolean, ear: boolean, streak: number): string {
  return `노방장 오늘의 문제 #${no} 📜${line ? "⭕" : "❌"} 🎧${ear ? "⭕" : "❌"}${streak > 1 ? ` 🔥${streak}일째` : ""}`;
}

export type DailyStats = { participants: number; rate: number | null };
export type DailyToday = { day: string; line: DailyStats; ear: DailyStats };
