/** 🏃 나는 어떤 러너? 1분 테스트 (10/21, 러닝 덕후방 — 팬 테스트와 같은 틀). 기록·건강 판단 없이 달리는 스타일만. */
export const RUNNER_INTRO_POST_ID = "5879"; // 러닝 덕후방 "🏃 나의 러닝 한 줄 자기소개"

export type RunnerAnswers = { dawn: boolean; crew: boolean; record: boolean; race: boolean };
export type RunnerType = { key: string; emoji: string; name: string; what: string };

export const RUNNER_TYPES: Record<string, RunnerType> = {
  dawn: { key: "dawn", emoji: "🌅", name: "새벽 혼런러", what: "알람보다 먼저 일어나 혼자 조용히 달려요. 하루를 이긴 기분으로 출근." },
  crew: { key: "crew", emoji: "👟", name: "크루 러너", what: "같이 뛰어야 더 멀리 가요. 러닝 끝난 뒤 수다까지가 한 세트." },
  record: { key: "record", emoji: "⏱", name: "기록 사냥꾼", what: "페이스·심박·케이던스를 챙기는 타입. 1초 줄이는 게 제일 짜릿해요." },
  medal: { key: "medal", emoji: "🏅", name: "대회 메달러", what: "대회 일정부터 챙기는 타입. 완주 메달이 늘어날수록 뿌듯해요." },
  scenery: { key: "scenery", emoji: "🌳", name: "풍경 산책러", what: "기록보다 오늘 본 노을이 중요해요. 천천히, 오래, 즐겁게." },
};

export function runnerPick(a: RunnerAnswers): RunnerType {
  if (a.record) return RUNNER_TYPES.record!;
  if (a.race) return RUNNER_TYPES.medal!;
  if (a.crew) return RUNNER_TYPES.crew!;
  return a.dawn ? RUNNER_TYPES.dawn! : RUNNER_TYPES.scenery!;
}

export const runnerBragLine = (t: RunnerType) => `🏃 러너 테스트: ${t.emoji} ${t.name} / 주 코스: `;
