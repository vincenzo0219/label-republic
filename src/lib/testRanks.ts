import { BASEBALL_INTRO_POST_ID } from "./baseballTest";
import { RUNNER_INTRO_POST_ID } from "./runnerTest";
import { YOGA_INTRO_POST_ID } from "./yogaTest";
import { SHOE_INTRO_POST_ID } from "./shoeTest";
import { DOG_INTRO_POST_ID } from "./dogTest";
import { EAR_BRAG_POST_ID } from "./earTest";
import { FAN_INTRO_POST_ID } from "./fanTest";
import { VEGAN_INTRO_POST_ID } from "./veganTest";
import { VIVARIUM_INTRO_POST_ID } from "./vivariumTest";

/**
 * 📊 테스트 결과 집계 (Sprint 95) — 결과 글에 남긴 한 줄을 모아 팀·타입별로 센다. 어제까지 남긴 것만 세어
 * "오늘 남긴 내 결과는 내일 아침 반영"이 되게 한다 (다음 날 다시 올 이유).
 */
export type RankTest = { key: string; postId: string; title: string; room: string; test: string; teams?: boolean };

export const RANK_TESTS: Record<string, RankTest> = {
  fan: { key: "fan", postId: FAN_INTRO_POST_ID, title: "⚽ K리그 팬 순위", room: "k리그-덕후방", test: "/fan-test", teams: true },
  kbo: { key: "kbo", postId: BASEBALL_INTRO_POST_ID, title: "⚾ KBO 팬 순위", room: "kbo-덕후방", test: "/kbo-test", teams: true },
  run: { key: "run", postId: RUNNER_INTRO_POST_ID, title: "🏃 러너 타입 분포", room: "러닝-덕후방", test: "/run-test" },
  yoga: { key: "yoga", postId: YOGA_INTRO_POST_ID, title: "🧘 수련 타입 분포", room: "요가-필라테스-덕후방", test: "/yoga-test" },
  shoe: { key: "shoe", postId: SHOE_INTRO_POST_ID, title: "👟 신발러 타입 분포", room: "신발-덕후방", test: "/shoe-test" },
  dog: { key: "dog", postId: DOG_INTRO_POST_ID, title: "🐶 견주 타입 분포", room: "반려견-덕후방", test: "/dog-test" },
  vegan: { key: "vegan", postId: VEGAN_INTRO_POST_ID, title: "🌱 채식 타입 분포", room: "비건-덕후방", test: "/vegan-test" },
  vivarium: { key: "vivarium", postId: VIVARIUM_INTRO_POST_ID, title: "🦎 첫 생물 분포", room: "비바리움-덕후방", test: "/vivarium-test" },
  ear: { key: "ear", postId: EAR_BRAG_POST_ID, title: "🎧 황금귀 점수 분포", room: "perfume-audio", test: "/ear-test" },
};

/** 결과 글 번호 → 집계 페이지 (결과 화면의 "내일 아침 공개" 링크) */
export const rankHrefFor = (postId: string): string | undefined => {
  const t = Object.values(RANK_TESTS).find((r) => r.postId === postId);
  return t && `/rank/${t.key}`;
};

/** 오늘 0시 (KST) — 이 시각 전까지 남긴 결과만 센다 */
export function kstMidnight(now = new Date()): Date {
  const day = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+09:00`);
}
