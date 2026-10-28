/**
 * 🎾 NTRP 1분 자가진단 (10/28 대표님 "예약알림이랑 ntrp 진행해"). 테니스방에 처음 온 사람이 자기 수준을 말하는 공통어.
 * 문항은 USTA NTRP 등급 설명의 기술 항목(랠리·서브·네트·백핸드·경기 경험)을 참고해 새로 썼다. 재미용 추정이고 공식 등급이 아니다.
 * 보기 점수 1~4, 6문항 합 6~24점 → 등급 구간.
 */
export type NtrpQ = { q: string; options: { label: string; score: 1 | 2 | 3 | 4 }[] };

export const NTRP_QUESTIONS: NtrpQ[] = [
  {
    q: "테니스 친 지 얼마나 됐어요?",
    options: [
      { label: "레슨 몇 번 받아 봤어요", score: 1 },
      { label: "1년이 안 됐어요", score: 2 },
      { label: "1~3년", score: 3 },
      { label: "3년 넘었어요", score: 4 },
    ],
  },
  {
    q: "비슷한 수준이랑 랠리하면?",
    options: [
      { label: "몇 번 넘기면 끊겨요", score: 1 },
      { label: "느린 공이면 10번은 가요", score: 2 },
      { label: "방향을 조금씩 바꿔 가며 길게 가요", score: 3 },
      { label: "깊이·속도를 조절하면서 상대를 흔들어요", score: 4 },
    ],
  },
  {
    q: "서브는?",
    options: [
      { label: "넣는 게 목표예요", score: 1 },
      { label: "첫 서브는 자주 실패, 세컨드는 들어가요", score: 2 },
      { label: "코스를 노리고, 더블폴트는 가끔", score: 3 },
      { label: "스핀·플랫을 골라 쓰고 서브로 점수를 따요", score: 4 },
    ],
  },
  {
    q: "네트 앞(발리)에서는?",
    options: [
      { label: "네트 앞은 무서워요", score: 1 },
      { label: "정면으로 오면 막을 수 있어요", score: 2 },
      { label: "복식에서 포치하러 나가요", score: 3 },
      { label: "발리로 끝내는 게 편해요", score: 4 },
    ],
  },
  {
    q: "백핸드는?",
    options: [
      { label: "되도록 포핸드로 돌아 쳐요", score: 1 },
      { label: "넘기는 정도는 돼요", score: 2 },
      { label: "랠리에서 안정적으로 쳐요", score: 3 },
      { label: "백핸드로도 공격해요", score: 4 },
    ],
  },
  {
    q: "게임(경기) 경험은?",
    options: [
      { label: "아직 랠리·레슨만 해요", score: 1 },
      { label: "동호회에서 가끔 게임해요", score: 2 },
      { label: "매주 게임하고 점수 계산도 익숙해요", score: 3 },
      { label: "동호인 대회에 나가 봤어요", score: 4 },
    ],
  },
];

export type NtrpBand = { min: number; level: string; name: string; what: string; next: string };

/** 점수가 높은 구간부터 (min 이상이면 그 구간) */
export const NTRP_BANDS: NtrpBand[] = [
  { min: 22, level: "4.5+", name: "상급 동호인", what: "구질을 골라 쓰고 경기를 설계하는 단계예요. 동호인 대회 상위권을 노려 볼 만해요.", next: "대회 일정은 테니스방 🎫 행사 탭에서 확인하세요." },
  { min: 19, level: "4.0", name: "중상급", what: "랠리가 안정적이고 서브·발리로 점수를 만들 줄 알아요. 복식 호흡이 승부를 가르는 단계.", next: "신인부·오픈부 기준은 대회 요강마다 달라요. 요강부터 보세요." },
  { min: 15, level: "3.5", name: "중급", what: "방향 조절이 되고 복식에서 네트 플레이도 해요. 동호회 게임이 제일 재밌을 때예요.", next: "같은 수준끼리 꾸준히 게임하면 4.0이 빨리 와요." },
  { min: 12, level: "3.0", name: "중급 진입", what: "랠리는 이어지는데 깊이와 서브가 아직 들쭉날쭉한 단계. 게임 맛을 알기 시작했어요.", next: "세컨드 서브 하나만 안정돼도 게임이 확 달라져요." },
  { min: 9, level: "2.5", name: "초급", what: "느린 랠리는 이어 가요. 게임 규칙을 익히며 코트에 정붙이는 단계예요.", next: "공공 코트 예약 오픈일을 알아 두면 연습량이 늘어요." },
  { min: 0, level: "1.5~2.0", name: "입문", what: "라켓 잡은 지 얼마 안 된 단계. 지금이 제일 빨리 느는 시기예요.", next: "레슨과 볼머신으로 기본 스트로크부터 다져 보세요." },
];

export function ntrpScore(picks: number[]): number | null {
  if (picks.length !== NTRP_QUESTIONS.length || picks.some((p) => !Number.isInteger(p) || p < 0 || p > 3)) return null;
  return picks.reduce((s, p, i) => s + NTRP_QUESTIONS[i]!.options[p]!.score, 0);
}

export const ntrpBand = (score: number): NtrpBand => NTRP_BANDS.find((b) => score >= b.min)!;
