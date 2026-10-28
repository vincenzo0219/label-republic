/**
 * 💬 썸 시뮬레이터: 3일간의 카톡 (10/28 대표님 "미혼남녀방에 할 게 없어서 지자체 행사만 보고 나간다", "와우 포인트·재미").
 * 구조는 성인 애착 이론 표준을 따른다: 불안(확인받고 싶다)·회피(거리를 두고 싶다) 두 축, 높고 낮음으로 4유형
 * (Bartholomew & Horowitz, 1991). 문항은 표준 설문(ECR)을 옮기지 않고 새로 썼다. 재미용이고 진단이 아니다.
 * 보기마다 [불안, 회피] 점수(0~2). 사람끼리 잇는 기능은 없다 (미혼남녀방 no_matching).
 */

export type SimChoice = { text: string; anx: number; avo: number };
export type SimScene = {
  day: 1 | 2 | 3;
  time: string;
  /** 상대가 보낸 말풍선 (없으면 상황 설명만) */
  them?: string[];
  /** 상황 설명 한 줄 (회색 글씨) */
  note?: string;
  /** 결과에서 "가장 오래 고민한 장면"으로 부를 이름 */
  label: string;
  choices: [SimChoice, SimChoice, SimChoice, SimChoice];
};

export const SIM_SCENES: SimScene[] = [
  {
    day: 1,
    time: "오후 6:40",
    note: "소개팅 다음 날, 상대에게서 먼저 연락이 왔어요.",
    them: ["어제 재밌었어요 :)"],
    label: "첫 연락에 답할 때",
    choices: [
      { text: "저도요! 다음엔 제가 맛집 알려 드릴게요", anx: 0, avo: 0 },
      { text: "답장을 쓰고 지우고, 다섯 번 고쳐서 보낸다", anx: 2, avo: 0 },
      { text: "30분은 기다렸다 보내야 덜 급해 보이겠지", anx: 1, avo: 1 },
      { text: "ㅎㅎ 네 (짧게)", anx: 0, avo: 2 },
    ],
  },
  {
    day: 1,
    time: "오후 9:00",
    note: "내가 보낸 카톡 옆 '1'이 30분째 안 없어져요.",
    label: "'1'이 안 없어질 때",
    choices: [
      { text: "바쁜가 보다. 하던 거 마저 한다", anx: 0, avo: 0 },
      { text: "프로필 사진이랑 상태 메시지를 다시 본다", anx: 2, avo: 0 },
      { text: "\"바쁘세요?\" 하나 더 보낸다", anx: 2, avo: 0 },
      { text: "역시 별 관심 없네. 나도 앱을 끈다", anx: 1, avo: 2 },
    ],
  },
  {
    day: 2,
    time: "오후 10:20",
    note: "상대가 요즘 힘든 집안 이야기를 길게 털어놨어요.",
    them: ["갑자기 이런 얘기해서 미안해요", "왠지 얘기하고 싶었어요"],
    label: "상대가 속마음을 털어놨을 때",
    choices: [
      { text: "끝까지 듣고, 나도 비슷한 얘기 하나 꺼낸다", anx: 0, avo: 0 },
      { text: "공감은 하는데 너무 무거워져서 화제를 돌린다", anx: 0, avo: 2 },
      { text: "\"나한테 이런 얘기를?\" 무슨 신호인지 밤새 생각한다", anx: 2, avo: 0 },
      { text: "해결 방법을 정리해서 보내 준다", anx: 0, avo: 1 },
    ],
  },
  {
    day: 2,
    time: "오후 11:05",
    note: "어제까지 길게 답하던 사람이…",
    them: ["ㅇㅇ"],
    label: "갑자기 단답이 왔을 때",
    choices: [
      { text: "\"피곤해요? 푹 자요!\"", anx: 0, avo: 0 },
      { text: "\"제가 뭐 잘못했어요?\"", anx: 2, avo: 0 },
      { text: "똑같이 \"ㅇㅇ\"으로 받아친다", anx: 1, avo: 2 },
      { text: "폰을 엎어 두고 내일까지 연락 안 한다", anx: 0, avo: 2 },
    ],
  },
  {
    day: 3,
    time: "오후 12:30",
    note: "좋긴 한데, 너무 빨리 가까워지는 느낌이 들어요.",
    them: ["우리 이번 주말에 볼래요?"],
    label: "주말에 보자고 했을 때",
    choices: [
      { text: "\"좋아요! 어디 갈까요?\"", anx: 0, avo: 0 },
      { text: "\"이번 주는 좀 바빠서요…\" 일단 미룬다", anx: 0, avo: 2 },
      { text: "거절하면 끝날까 봐 다른 약속을 다 뺀다", anx: 2, avo: 0 },
      { text: "좋다고 해 놓고, 전날 둘러댈 핑계를 생각한다", anx: 2, avo: 2 },
    ],
  },
  {
    day: 3,
    time: "오후 3:10",
    note: "상대 SNS에 이성 친구랑 둘이 찍은 사진이 올라왔어요.",
    label: "SNS에 이성 친구 사진이 올라왔을 때",
    choices: [
      { text: "웃으면서 \"누구예요? 친해 보여요\" 가볍게 묻는다", anx: 0, avo: 0 },
      { text: "그 친구 계정까지 들어가 본다", anx: 2, avo: 0 },
      { text: "신경 쓰이지만 티 안 내고, 나도 연락을 줄인다", anx: 1, avo: 2 },
      { text: "원래 사진 많이 찍나 보지. 별생각 없다", anx: 0, avo: 1 },
    ],
  },
  {
    day: 3,
    time: "오후 8:45",
    them: ["근데 우리 무슨 사이예요?"],
    label: "\"우리 무슨 사이예요?\"",
    choices: [
      { text: "지금 내 마음을 솔직하게 말한다", anx: 0, avo: 0 },
      { text: "\"글쎄요 ㅎㅎ\" 웃음으로 넘긴다", anx: 0, avo: 2 },
      { text: "\"그쪽은요?\" 상대 답부터 듣고 싶다", anx: 2, avo: 1 },
      { text: "좋다고 하고 싶은데 거절당할까 봐 이모티콘만 보낸다", anx: 2, avo: 2 },
    ],
  },
  {
    day: 3,
    time: "오후 11:30",
    note: "오늘은 상대 연락이 평소보다 확 줄었어요.",
    label: "연락이 확 줄었을 때",
    choices: [
      { text: "오늘 바쁜가 보다. 내일 물어보면 되지", anx: 0, avo: 0 },
      { text: "3일 치 대화를 다시 읽으며 내 실수를 찾는다", anx: 2, avo: 0 },
      { text: "오히려 좀 편하다", anx: 0, avo: 2 },
      { text: "먼저 연락하고 싶은데 지는 것 같아서 참는다", anx: 2, avo: 1 },
    ],
  },
];

export const SIM_MAX = SIM_SCENES.reduce((s, sc) => s + Math.max(...sc.choices.map((c) => Math.max(c.anx, c.avo))), 0);
/** 이 점수 이상이면 그 축이 "높음" (8장면 · 최대 16점) */
export const SIM_HIGH = 6;

export type SimType = "sunny" | "shower" | "fog" | "storm";

export const SIM_TYPES: Record<SimType, { emoji: string; name: string; std: string; line: string; strength: string; watch: string; good: SimType; clash: SimType }> = {
  sunny: {
    emoji: "☀️",
    name: "맑음형",
    std: "안정형",
    line: "서운해도 말로 풀 줄 아는 타입. 상대가 단답을 해도 하루가 무너지지 않아요.",
    strength: "불안한 사람 옆에서 날씨를 맑게 만들어 줘요.",
    watch: "다들 나처럼 편할 거라 생각하기 쉬워요. 상대의 불안은 한 번 더 물어봐 주세요.",
    good: "shower",
    clash: "storm",
  },
  shower: {
    emoji: "🌧",
    name: "소나기형",
    std: "불안형",
    line: "확인받아야 마음이 놓이는 타입. 답장 하나에 하루 날씨가 바뀌어요.",
    strength: "표현이 풍부하고, 상대에게 마음을 아낌없이 줘요.",
    watch: "'1'이 안 없어지는 30분 동안 머릿속에서 이별까지 갔다 오지 않기.",
    good: "sunny",
    clash: "fog",
  },
  fog: {
    emoji: "🌫",
    name: "안개형",
    std: "회피형",
    line: "좋아질수록 한 발 물러나는 타입. 썸 상대는 당신이 식었다고 오해하기 쉬워요. 당신은 그냥 숨 고르는 중인데.",
    strength: "혼자서도 잘 지내고, 관계에 휘둘리지 않아요.",
    watch: "거리 둘 때 \"지금 좀 정리할 시간이 필요해\" 한 줄만 보내 주세요. 안개가 걷혀요.",
    good: "sunny",
    clash: "shower",
  },
  storm: {
    emoji: "🌪",
    name: "태풍형",
    std: "공포-회피형",
    line: "가까워지고 싶은데 동시에 상처받을까 겁나는 타입. 다가갔다 물러났다, 마음속이 제일 바빠요.",
    strength: "누구보다 상대 마음을 깊이 읽어요.",
    watch: "밀었다 당겼다 하기 전에, 지금 느끼는 걸 한 문장으로 적어 보세요.",
    good: "sunny",
    clash: "fog",
  },
};

export function simTypeOf(anx: number, avo: number): SimType {
  const a = anx >= SIM_HIGH;
  const v = avo >= SIM_HIGH;
  return a && v ? "storm" : a ? "shower" : v ? "fog" : "sunny";
}

/** 고른 보기 번호(장면마다 0~3) → 점수와 유형. 잘못된 입력이면 null */
export function scoreSim(picks: number[]): { anx: number; avo: number; type: SimType } | null {
  if (picks.length !== SIM_SCENES.length || picks.some((p) => !Number.isInteger(p) || p < 0 || p > 3)) return null;
  let anx = 0;
  let avo = 0;
  picks.forEach((p, i) => {
    const c = SIM_SCENES[i]!.choices[p]!;
    anx += c.anx;
    avo += c.avo;
  });
  return { anx, avo, type: simTypeOf(anx, avo) };
}

export type SimStats = { participants: number; share: Record<SimType, number> };
export const SIM_MIN_PARTICIPANTS = 10;
