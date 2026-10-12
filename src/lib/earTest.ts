/**
 * 황금귀 테스트 (Sprint 59) — 같은 6초 구간의 원본과 MP3 압축본(64~192kbps)을 듣고 원본을 고르는 10문제.
 * 음원은 노방장이 직접 합성한 곡이라 저작권 문제가 없다. 압축본은 MP3로 인코딩한 뒤 다시 풀어 원본과 같은
 * WAV(무압축)로 저장했다 — 파일 형식·크기로 정답을 알 수 없게. 만드는 스크립트: marketing/ear-test/.
 * 블루투스 코덱 자체를 재현한 것은 아니다 (화면에도 "압축 음질 테스트"라고 밝힌다).
 */
export type EarRound = { kbps: number; orig: string; comp: string };

export const EAR_ROUNDS: readonly EarRound[] = [
  { kbps: 64, orig: "/ear/r1-b8c92385.wav", comp: "/ear/r1-cabe8ea1.wav" },
  { kbps: 64, orig: "/ear/r2-a686f333.wav", comp: "/ear/r2-b277eca0.wav" },
  { kbps: 96, orig: "/ear/r3-9c67e459.wav", comp: "/ear/r3-7d8fc7eb.wav" },
  { kbps: 96, orig: "/ear/r4-2a42ac5e.wav", comp: "/ear/r4-0c961845.wav" },
  { kbps: 128, orig: "/ear/r5-a8fa800c.wav", comp: "/ear/r5-6a6ef866.wav" },
  { kbps: 128, orig: "/ear/r6-2a7a7443.wav", comp: "/ear/r6-8cef3cbb.wav" },
  { kbps: 160, orig: "/ear/r7-eb24b6f0.wav", comp: "/ear/r7-fe2307c4.wav" },
  { kbps: 160, orig: "/ear/r8-97edbe63.wav", comp: "/ear/r8-dba6a5f1.wav" },
  { kbps: 192, orig: "/ear/r9-636dc0af.wav", comp: "/ear/r9-48a5ffb3.wav" },
  { kbps: 192, orig: "/ear/r10-9e26f8e4.wav", comp: "/ear/r10-705d674e.wav" },
];

export const EAR_TOTAL = EAR_ROUNDS.length;

/** 이 인원보다 적으면 "상위 몇 %"를 보여 주지 않는다 (몇 명으로 순위를 매기면 오해를 준다) */
export const EAR_MIN_PARTICIPANTS = 20;

export type EarTier = { emoji: string; name: string; line: string };

/** 점수별 등급 — 찍어도 5개 안팎은 맞히므로 6개 이하는 "구분 어려움"으로 본다 */
export function earTier(score: number): EarTier {
  if (score >= 10) return { emoji: "🏆", name: "황금귀", line: "192kbps까지 전부 구분했어요" };
  if (score >= 8) return { emoji: "🔥", name: "덕후 귀", line: "웬만한 압축은 다 들려요" };
  if (score >= 7) return { emoji: "👂", name: "예민한 귀", line: "낮은 음질은 확실히 구분해요" };
  return { emoji: "🎧", name: "평범한 귀", line: "압축 음원도 충분히 즐길 수 있는 귀예요" };
}

export function popcount(mask: number): number {
  let n = 0;
  for (let m = mask; m; m >>= 1) n += m & 1;
  return n;
}

export type EarStats = {
  participants: number;
  /** 내 점수 기준 상위 몇 % (참가자가 적으면 null) */
  topPercent: number | null;
  /** 첫 응시 기준 평균 점수 */
  average: number | null;
  /** 음질별 정답률 (0~1), 첫 응시 기준 */
  byKbps: { kbps: number; rate: number }[];
};
