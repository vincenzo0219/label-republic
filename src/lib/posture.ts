/**
 * 📸 사진 2장 자세 체크 (/posture-check, 🧘 요가·필라테스 강사방 링크): 순수 계산 함수.
 * 브라우저의 MediaPipe Pose Landmarker 가 준 2D 랜드마크(0~1 정규화 좌표)로 각도·비율을 잰다.
 * 사진은 서버로 보내지 않는다. 저장하는 것은 숫자뿐(localStorage, src/components/PostureCheck.tsx).
 * 의료 판단이 아니라 수업 참고용 "자세 체크"·"경향" 표시다.
 */

// ---------------------------------------------------------------------------
// 라이브러리·모델 (이 페이지에서만 지연 로드). 버전은 정확히 고정한다.
// ---------------------------------------------------------------------------
export const MEDIAPIPE_VERSION = "0.10.35";
export const MEDIAPIPE_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
export const MEDIAPIPE_BUNDLE_URL = `${MEDIAPIPE_CDN}/vision_bundle.mjs`;
export const MEDIAPIPE_WASM_URL = `${MEDIAPIPE_CDN}/wasm`;
export const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

export const DISCLAIMER = "의료 진단이 아니에요. 통증이 있거나 걱정되면 전문의와 상담하세요.";

// ---------------------------------------------------------------------------
// 기준값: 한곳에 모은다.
// ⚠️ 선별(스크리닝)용 경험치일 뿐 임상 기준(cutoff)이 아니다. 사진 한 장·2D 랜드마크라 오차가 크다.
//    값 |x| < mild 이면 정상 범위, mild ≤ |x| < clear 이면 경미, |x| ≥ clear 이면 뚜렷.
// ---------------------------------------------------------------------------
export const THRESHOLDS = {
  /** 정면: 양 어깨점을 이은 선의 수평 대비 각도(°). 어깨폭 약 35cm 에서 2.5° ≈ 1.5cm 높이 차 */
  shoulderTiltDeg: { mild: 2.5, clear: 5 },
  /** 정면: 양 엉덩이점(고관절 중심 추정) 선 각도(°). 폭이 좁아 같은 높이 차도 각도가 커서 조금 넉넉히 */
  hipTiltDeg: { mild: 3, clear: 6 },
  /** 정면: 양 귀를 이은 선 각도(°) */
  headTiltDeg: { mild: 4, clear: 8 },
  /** 정면: (무릎 간격 − 발목 간격) ÷ 엉덩이폭. 발을 모으고 섰을 때. 양수 쪽 = O다리 경향 */
  kneeGapO: { mild: 0.3, clear: 0.5 },
  /** 같은 지수의 음수 쪽 = X다리 경향 (절댓값으로 비교) */
  kneeGapX: { mild: 0.1, clear: 0.3 },
  /** 측면: 귀가 어깨보다 앞으로 나온 수평 거리 ÷ 몸통 길이(어깨~엉덩이) */
  headForwardRatio: { mild: 0.1, clear: 0.2 },
  /** 측면: 어깨→귀 선이 수직에서 앞으로 기운 각도(°). C7 랜드마크가 없어 어깨점으로 대신한 근사치 */
  headForwardDeg: { mild: 15, clear: 25 },
} as const;

/** 사진 품질 점검 기준 (역시 경험치) */
export const QUALITY = {
  /** 이 아래 visibility 면 "잘 안 보여요" */
  minVisibility: 0.5,
  /** 화면 가장자리 여유 (정규화 좌표) */
  edgeMargin: 0.01,
  /** 정면: 양 발목(발뒤꿈치) 선이 이보다 기울면 카메라 기울기 의심(°) */
  frontFloorTiltDeg: 4,
  /** 측면: 발뒤꿈치→발끝 선이 이보다 기울면 카메라 기울기 의심(°) */
  sideFloorTiltDeg: 10,
  /** 몸(코~발목) 높이가 사진 높이의 이 비율보다 작으면 "너무 멀어요" */
  minBodyHeight: 0.4,
  /** 어깨폭 ÷ 몸통 길이: 정면이면 보통 이보다 크다 */
  frontMinShoulderRatio: 0.45,
  /** 측면이면 보통 이보다 작다 */
  sideMaxShoulderRatio: 0.35,
} as const;

// ---------------------------------------------------------------------------
// 랜드마크
// ---------------------------------------------------------------------------
export type Landmark = { x: number; y: number; z?: number; visibility?: number };

/** MediaPipe Pose 33점 중 쓰는 번호. LEFT/RIGHT 는 사진 속 사람 기준 */
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

/** 겹쳐 그릴 뼈대 선 */
export const POSE_LINKS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
  [7, 8], [0, 7], [0, 8],
];

export type Size = { width: number; height: number };
type P = { x: number; y: number };

const px = (l: Landmark, s: Size): P => ({ x: l.x * s.width, y: l.y * s.height });
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const deg = (rad: number) => (rad * 180) / Math.PI;

/** 두 점을 이은 선이 수평에서 기운 각도 (0~90°). 픽셀 좌표 기준이라 사진 비율을 반영한다 */
export function tiltDeg(a: Landmark, b: Landmark, s: Size): number {
  const pa = px(a, s);
  const pb = px(b, s);
  const dx = Math.abs(pb.x - pa.x);
  const dy = Math.abs(pb.y - pa.y);
  if (dx === 0 && dy === 0) return 0;
  return deg(Math.atan2(dy, dx));
}

export type Grade = "normal" | "mild" | "clear";
export const GRADE_LABEL: Record<Grade, string> = { normal: "정상 범위", mild: "경미", clear: "뚜렷" };

export function grade(value: number, t: { mild: number; clear: number }): Grade {
  const v = Math.abs(value);
  if (v >= t.clear) return "clear";
  if (v >= t.mild) return "mild";
  return "normal";
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 측정 결과
// ---------------------------------------------------------------------------
export type MetricKey = "shoulderTilt" | "hipTilt" | "headTilt" | "kneeGap" | "headForwardRatio" | "headForwardAngle";

export type Metric = {
  key: MetricKey;
  label: string;
  /** 비교·저장용 숫자 (각도는 °, 비율은 소수) */
  value: number;
  /** 화면 표시용 */
  display: string;
  grade: Grade;
  /** 한 줄 설명 (어느 쪽이 높은지, 어떤 경향인지) */
  note: string;
};

export const METRIC_UNIT: Record<MetricKey, string> = {
  shoulderTilt: "°",
  hipTilt: "°",
  headTilt: "°",
  kneeGap: "",
  headForwardRatio: "",
  headForwardAngle: "°",
};

export const METRIC_LABEL: Record<MetricKey, string> = {
  shoulderTilt: "어깨 높이 차",
  hipTilt: "골반 높이 차",
  headTilt: "머리 기울기",
  kneeGap: "무릎·발목 간격",
  headForwardRatio: "귀 앞쪽 거리 비율",
  headForwardAngle: "머리 앞 기울기 (근사)",
};

/** 왼쪽·오른쪽 중 어느 쪽 점이 더 높은지 (사람 기준). 이미지 y 가 작을수록 위 */
function higherSide(left: Landmark, right: Landmark): "왼쪽" | "오른쪽" {
  return left.y < right.y ? "왼쪽" : "오른쪽";
}

function tiltMetric(key: "shoulderTilt" | "hipTilt" | "headTilt", left: Landmark, right: Landmark, s: Size, part: string): Metric {
  const t = key === "shoulderTilt" ? THRESHOLDS.shoulderTiltDeg : key === "hipTilt" ? THRESHOLDS.hipTiltDeg : THRESHOLDS.headTiltDeg;
  const v = round1(tiltDeg(left, right, s));
  const g = grade(v, t);
  const note =
    g === "normal"
      ? "좌우가 거의 수평이에요"
      : key === "headTilt"
        ? `머리가 ${higherSide(left, right) === "왼쪽" ? "오른쪽" : "왼쪽"}으로 기운 경향`
        : `${higherSide(left, right)} ${part}이 더 높은 경향`;
  return { key, label: METRIC_LABEL[key], value: v, display: `${v.toFixed(1)}°`, grade: g, note };
}

export type KneeGap = { index: number; ratio: number | null; tendency: "O" | "X" | null; grade: Grade };

/**
 * 무릎 간격 vs 발목 간격. 발을 모으고 선 정면 사진 기준.
 * index = (무릎 간격 − 발목 간격) ÷ 엉덩이폭 (사진 크기·거리와 무관하게 비교하려고 엉덩이폭으로 나눈다)
 * ratio = 무릎 간격 ÷ 발목 간격 (참고 표시용, 발목 간격이 거의 0 이면 null)
 */
export function kneeGap(lm: Landmark[], s: Size): KneeGap {
  const kx = Math.abs(px(lm[LM.leftKnee], s).x - px(lm[LM.rightKnee], s).x);
  const ax = Math.abs(px(lm[LM.leftAnkle], s).x - px(lm[LM.rightAnkle], s).x);
  const hip = dist(px(lm[LM.leftHip], s), px(lm[LM.rightHip], s));
  const index = hip > 0 ? round2((kx - ax) / hip) : 0;
  const ratio = ax > hip * 0.05 ? round2(kx / ax) : null;
  if (index >= 0) {
    const g = grade(index, THRESHOLDS.kneeGapO);
    return { index, ratio, tendency: g === "normal" ? null : "O", grade: g };
  }
  const g = grade(index, THRESHOLDS.kneeGapX);
  return { index, ratio, tendency: g === "normal" ? null : "X", grade: g };
}

export function measureFront(lm: Landmark[], s: Size): Metric[] {
  const kg = kneeGap(lm, s);
  return [
    tiltMetric("shoulderTilt", lm[LM.leftShoulder], lm[LM.rightShoulder], s, "어깨"),
    tiltMetric("hipTilt", lm[LM.leftHip], lm[LM.rightHip], s, "골반"),
    tiltMetric("headTilt", lm[LM.leftEar], lm[LM.rightEar], s, "귀"),
    {
      key: "kneeGap",
      label: METRIC_LABEL.kneeGap,
      value: kg.index,
      display: kg.ratio === null ? `지수 ${kg.index.toFixed(2)}` : `${kg.ratio.toFixed(2)}배 (지수 ${kg.index.toFixed(2)})`,
      grade: kg.grade,
      note: kg.tendency === "O" ? "무릎 사이가 벌어지는 O다리 경향" : kg.tendency === "X" ? "발목 사이가 벌어지는 X다리 경향" : "무릎·발목 간격이 고른 편이에요",
    },
  ];
}

export type SideInfo = {
  /** 카메라 쪽(더 잘 보이는) 몸 방향 */
  side: "left" | "right";
  /** 사진에서 얼굴이 향한 방향 (+1 오른쪽, −1 왼쪽) */
  facing: 1 | -1;
  forwardRatio: number;
  forwardDeg: number;
};

const vis = (l: Landmark | undefined) => l?.visibility ?? 1;

/** 측면: 카메라 쪽 귀·어깨·엉덩이로 머리 전방 거리 비율과 근사 각도를 잰다 */
export function sideInfo(lm: Landmark[], s: Size): SideInfo {
  const leftScore = vis(lm[LM.leftEar]) + vis(lm[LM.leftShoulder]) + vis(lm[LM.leftHip]);
  const rightScore = vis(lm[LM.rightEar]) + vis(lm[LM.rightShoulder]) + vis(lm[LM.rightHip]);
  const side = leftScore >= rightScore ? "left" : "right";
  const ear = px(lm[side === "left" ? LM.leftEar : LM.rightEar], s);
  const sh = px(lm[side === "left" ? LM.leftShoulder : LM.rightShoulder], s);
  const hip = px(lm[side === "left" ? LM.leftHip : LM.rightHip], s);
  const nose = px(lm[LM.nose], s);
  // 코가 귀보다 오른쪽이면 오른쪽을 보고 서 있다 (코가 안 잡히면 발끝 방향)
  let facing: 1 | -1 = nose.x >= ear.x ? 1 : -1;
  if (Math.abs(nose.x - ear.x) < 1e-6) {
    const heel = px(lm[side === "left" ? LM.leftHeel : LM.rightHeel], s);
    const toe = px(lm[side === "left" ? LM.leftFoot : LM.rightFoot], s);
    facing = toe.x >= heel.x ? 1 : -1;
  }
  const forward = (ear.x - sh.x) * facing;
  const up = sh.y - ear.y;
  const torso = dist(sh, hip);
  return {
    side,
    facing,
    forwardRatio: torso > 0 ? round2(forward / torso) : 0,
    forwardDeg: round1(deg(Math.atan2(forward, Math.max(up, 1e-6)))),
  };
}

export function measureSide(lm: Landmark[], s: Size): Metric[] {
  const info = sideInfo(lm, s);
  const back = (v: number) => (v < 0 ? "귀가 어깨보다 뒤에 있어요" : "귀가 어깨 위쪽에 가까워요");
  const rg = info.forwardRatio < 0 ? "normal" : grade(info.forwardRatio, THRESHOLDS.headForwardRatio);
  const ag = info.forwardDeg < 0 ? "normal" : grade(info.forwardDeg, THRESHOLDS.headForwardDeg);
  return [
    {
      key: "headForwardRatio",
      label: METRIC_LABEL.headForwardRatio,
      value: info.forwardRatio,
      display: info.forwardRatio.toFixed(2),
      grade: rg,
      note: rg === "normal" ? back(info.forwardRatio) : "머리가 앞으로 나온 거북목 경향",
    },
    {
      key: "headForwardAngle",
      label: METRIC_LABEL.headForwardAngle,
      value: info.forwardDeg,
      display: `${info.forwardDeg.toFixed(1)}°`,
      grade: ag,
      note: ag === "normal" ? back(info.forwardDeg) : "머리가 앞으로 기운 거북목 경향 (어깨점 기준 근사치)",
    },
  ];
}

// ---------------------------------------------------------------------------
// 사진 품질 점검
// ---------------------------------------------------------------------------
export type View = "front" | "side";

const FRONT_REQUIRED = [
  LM.nose, LM.leftEar, LM.rightEar, LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip,
  LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle,
];

function sideRequired(lm: Landmark[]): number[] {
  const left = vis(lm[LM.leftEar]) + vis(lm[LM.leftShoulder]) + vis(lm[LM.leftHip]);
  const right = vis(lm[LM.rightEar]) + vis(lm[LM.rightShoulder]) + vis(lm[LM.rightHip]);
  return left >= right
    ? [LM.nose, LM.leftEar, LM.leftShoulder, LM.leftHip, LM.leftKnee, LM.leftAnkle]
    : [LM.nose, LM.rightEar, LM.rightShoulder, LM.rightHip, LM.rightKnee, LM.rightAnkle];
}

/** 사진 품질 경고 문구 목록 (없으면 빈 배열). 결과는 계속 보여 주되 "참고만" 하게 한다 */
export function qualityWarnings(lm: Landmark[], s: Size, view: View): string[] {
  const out: string[] = [];
  if (lm.length < 33) return ["몸을 찾지 못했어요. 전신이 보이게 다시 찍어 주세요"];
  const req = view === "front" ? FRONT_REQUIRED : sideRequired(lm);

  const low = req.filter((i) => vis(lm[i]) < QUALITY.minVisibility);
  if (low.length) out.push("일부 관절이 잘 안 보여요. 몸에 붙는 옷, 밝은 곳에서 다시 찍으면 더 정확해요");

  const m = QUALITY.edgeMargin;
  const outside = req.some((i) => lm[i].x < m || lm[i].x > 1 - m || lm[i].y < m || lm[i].y > 1 - m);
  if (outside) out.push("몸 일부가 사진 밖으로 나갔어요. 머리부터 발끝까지 보이게 찍어 주세요");

  const ankleY = view === "front" ? (lm[LM.leftAnkle].y + lm[LM.rightAnkle].y) / 2 : lm[req[req.length - 1]].y;
  if (ankleY - lm[LM.nose].y < QUALITY.minBodyHeight) out.push("몸이 너무 작게 나왔어요. 조금 더 가까이(2~3m) 찍어 주세요");

  const sh = dist(px(lm[LM.leftShoulder], s), px(lm[LM.rightShoulder], s));
  const torso = dist(mid(px(lm[LM.leftShoulder], s), px(lm[LM.rightShoulder], s)), mid(px(lm[LM.leftHip], s), px(lm[LM.rightHip], s)));
  const shoulderRatio = torso > 0 ? sh / torso : 0;

  if (view === "front") {
    const heelsOk = vis(lm[LM.leftHeel]) >= QUALITY.minVisibility && vis(lm[LM.rightHeel]) >= QUALITY.minVisibility;
    const floor = heelsOk ? tiltDeg(lm[LM.leftHeel], lm[LM.rightHeel], s) : tiltDeg(lm[LM.leftAnkle], lm[LM.rightAnkle], s);
    if (floor > QUALITY.frontFloorTiltDeg) out.push("양발 높이가 많이 달라요. 카메라가 기울었거나 한쪽에 체중을 실었을 수 있어요");
    if (shoulderRatio < QUALITY.frontMinShoulderRatio) out.push("정면 사진이 맞나요? 몸이 옆으로 돌아간 것 같아요");
  } else {
    const heel = req.includes(LM.leftEar) ? LM.leftHeel : LM.rightHeel;
    const toe = heel === LM.leftHeel ? LM.leftFoot : LM.rightFoot;
    if (vis(lm[heel]) >= QUALITY.minVisibility && vis(lm[toe]) >= QUALITY.minVisibility && tiltDeg(lm[heel], lm[toe], s) > QUALITY.sideFloorTiltDeg) {
      out.push("발바닥 선이 기울어 보여요. 카메라를 수평으로 맞춰 주세요");
    }
    if (shoulderRatio > QUALITY.sideMaxShoulderRatio) out.push("측면 사진이 맞나요? 몸이 정면에 가깝게 보여요");
  }
  return out;
}

// ---------------------------------------------------------------------------
// 전후 비교 기록 (숫자만, localStorage). 사진·이름은 저장하지 않는다
// ---------------------------------------------------------------------------
export const STORAGE_KEY = "lr_posture_v1";
export const MAX_RECORDS = 30;
export const MEMO_MAX = 40;

export type PostureRecord = {
  at: number;
  memo: string;
  values: Partial<Record<MetricKey, number>>;
};

const KEYS = Object.keys(METRIC_LABEL) as MetricKey[];

/** 저장된 문자열 → 기록 목록 (깨진 값은 버린다) */
export function parseRecords(raw: string | null): PostureRecord[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: PostureRecord[] = [];
  for (const r of data) {
    if (!r || typeof r !== "object") continue;
    const { at, memo, values } = r as Record<string, unknown>;
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    const vals: Partial<Record<MetricKey, number>> = {};
    if (values && typeof values === "object") {
      for (const k of KEYS) {
        const v = (values as Record<string, unknown>)[k];
        if (typeof v === "number" && Number.isFinite(v)) vals[k] = v;
      }
    }
    out.push({ at, memo: typeof memo === "string" ? memo.slice(0, MEMO_MAX) : "", values: vals });
  }
  return out.slice(-MAX_RECORDS);
}

export function makeRecord(metrics: Metric[], memo: string, at: number): PostureRecord {
  const values: Partial<Record<MetricKey, number>> = {};
  for (const m of metrics) values[m.key] = m.value;
  return { at, memo: memo.trim().slice(0, MEMO_MAX), values };
}

/** 새 기록을 붙이고 오래된 것은 잘라 문자열로 */
export function appendRecord(list: PostureRecord[], rec: PostureRecord): PostureRecord[] {
  return [...list, rec].slice(-MAX_RECORDS);
}

export type Delta = { key: MetricKey; before: number; after: number; diff: number; better: boolean | null };

/**
 * 두 기록 비교. 모든 항목이 "0 에 가까울수록 고른 편" 이라 절댓값이 줄면 better.
 * (머리 전방 값은 음수=뒤쪽이라 0 이하는 0 으로 본다)
 */
export function compareRecords(before: PostureRecord, after: PostureRecord): Delta[] {
  const out: Delta[] = [];
  for (const k of KEYS) {
    const b = before.values[k];
    const a = after.values[k];
    if (b === undefined || a === undefined) continue;
    const mag = (v: number) => (k === "headForwardRatio" || k === "headForwardAngle" ? Math.max(v, 0) : Math.abs(v));
    const d = mag(a) - mag(b);
    const eps = METRIC_UNIT[k] === "°" ? 0.5 : 0.02;
    out.push({ key: k, before: b, after: a, diff: round2(a - b), better: Math.abs(d) < eps ? null : d < 0 });
  }
  return out;
}
