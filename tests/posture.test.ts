import { describe, expect, it } from "vitest";
import {
  LM,
  THRESHOLDS,
  appendRecord,
  compareRecords,
  grade,
  kneeGap,
  makeRecord,
  measureFront,
  measureSide,
  parseRecords,
  qualityWarnings,
  sideInfo,
  tiltDeg,
  type Landmark,
  type Metric,
} from "@/lib/posture";

const SQ = { width: 1000, height: 1000 };

/** 33점을 모두 채운 뒤 필요한 점만 덮어쓴다 (가운데 아무 점, 잘 보임) */
function pose(points: Partial<Record<number, [number, number]>>, visibility = 0.99): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }));
  for (const [i, p] of Object.entries(points)) lm[Number(i)] = { x: p![0], y: p![1], visibility };
  return lm;
}

/** 반듯한 정면: 사람 왼쪽이 사진 오른쪽(x 큼). 발을 모으고 섰다 */
function front(over: Partial<Record<number, [number, number]>> = {}): Landmark[] {
  return pose({
    [LM.nose]: [0.5, 0.12],
    [LM.leftEar]: [0.54, 0.11],
    [LM.rightEar]: [0.46, 0.11],
    [LM.leftShoulder]: [0.6, 0.22],
    [LM.rightShoulder]: [0.4, 0.22],
    [LM.leftHip]: [0.56, 0.5],
    [LM.rightHip]: [0.44, 0.5],
    [LM.leftKnee]: [0.53, 0.7],
    [LM.rightKnee]: [0.47, 0.7],
    [LM.leftAnkle]: [0.52, 0.9],
    [LM.rightAnkle]: [0.48, 0.9],
    [LM.leftHeel]: [0.52, 0.92],
    [LM.rightHeel]: [0.48, 0.92],
    [LM.leftFoot]: [0.54, 0.94],
    [LM.rightFoot]: [0.46, 0.94],
    ...over,
  });
}

/** 오른쪽을 보고 선 측면 (왼쪽 몸이 카메라 쪽) */
function side(earX: number, over: Partial<Record<number, [number, number]>> = {}): Landmark[] {
  const lm = pose({
    [LM.nose]: [earX + 0.05, 0.12],
    [LM.leftEar]: [earX, 0.12],
    [LM.leftShoulder]: [0.5, 0.22],
    [LM.rightShoulder]: [0.51, 0.22],
    [LM.leftHip]: [0.5, 0.5],
    [LM.rightHip]: [0.51, 0.5],
    [LM.leftKnee]: [0.5, 0.7],
    [LM.leftAnkle]: [0.5, 0.9],
    [LM.leftHeel]: [0.49, 0.92],
    [LM.leftFoot]: [0.56, 0.92],
    ...over,
  });
  // 반대쪽(오른쪽) 몸은 가려서 잘 안 보인다
  for (const i of [LM.rightEar, LM.rightShoulder, LM.rightHip]) lm[i] = { ...lm[i], visibility: 0.3 };
  return lm;
}

const byKey = (ms: Metric[], k: Metric["key"]) => ms.find((m) => m.key === k)!;

describe("기본 기하", () => {
  it("수평선은 0°, 45° 선은 45°, 순서와 무관", () => {
    expect(tiltDeg({ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, SQ)).toBe(0);
    expect(tiltDeg({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, SQ)).toBeCloseTo(45, 9);
    expect(tiltDeg({ x: 0.2, y: 0.2 }, { x: 0.1, y: 0.1 }, SQ)).toBeCloseTo(45, 9);
  });
  it("픽셀 비율을 반영한다: 세로 사진(1000×2000)에서 같은 정규화 차이는 더 가파르다", () => {
    const a = { x: 0.4, y: 0.5 };
    const b = { x: 0.6, y: 0.51 };
    expect(tiltDeg(a, b, { width: 1000, height: 2000 })).toBeGreaterThan(tiltDeg(a, b, SQ));
    expect(tiltDeg(a, b, { width: 1000, height: 2000 })).toBeCloseTo((Math.atan(20 / 200) * 180) / Math.PI, 9);
  });
  it("등급: 경계값은 위 등급", () => {
    const t = { mild: 2, clear: 4 };
    expect(grade(1.99, t)).toBe("normal");
    expect(grade(2, t)).toBe("mild");
    expect(grade(-4, t)).toBe("clear");
  });
});

describe("정면", () => {
  it("반듯한 자세는 모두 정상 범위, 품질 경고 없음", () => {
    const ms = measureFront(front(), SQ);
    expect(ms.map((m) => m.grade)).toEqual(["normal", "normal", "normal", "normal"]);
    expect(byKey(ms, "shoulderTilt").value).toBe(0);
    expect(qualityWarnings(front(), SQ, "front")).toEqual([]);
  });

  it("어깨: 왼쪽 어깨가 0.02 높으면 약 5.7° → 뚜렷, 왼쪽이 높다고 쓴다", () => {
    const ms = measureFront(front({ [LM.leftShoulder]: [0.6, 0.2] }), SQ);
    const s = byKey(ms, "shoulderTilt");
    expect(s.value).toBeCloseTo(5.7, 1);
    expect(s.grade).toBe("clear");
    expect(s.note).toContain("왼쪽 어깨");
  });

  it("어깨: 0.01 차이(약 2.9°)는 경미", () => {
    const s = byKey(measureFront(front({ [LM.rightShoulder]: [0.4, 0.21] }), SQ), "shoulderTilt");
    expect(s.value).toBeCloseTo(2.9, 1);
    expect(s.grade).toBe("mild");
    expect(s.note).toContain("오른쪽 어깨");
  });

  it("골반: 엉덩이폭 0.12 에서 0.01 차이 ≈ 4.8° → 경미", () => {
    const h = byKey(measureFront(front({ [LM.leftHip]: [0.56, 0.49] }), SQ), "hipTilt");
    expect(h.value).toBeCloseTo(4.8, 1);
    expect(h.grade).toBe("mild");
    expect(h.note).toContain("왼쪽 골반");
  });

  it("머리 기울기: 오른쪽 귀가 내려가면 오른쪽으로 기운 경향", () => {
    const h = byKey(measureFront(front({ [LM.rightEar]: [0.46, 0.125] }), SQ), "headTilt");
    expect(h.value).toBeCloseTo(10.6, 1); // atan(15/80)
    expect(h.grade).toBe("clear");
    expect(h.note).toContain("오른쪽으로 기운");
  });

  it("O다리: 무릎이 벌어지고 발목은 붙음", () => {
    const lm = front({ [LM.leftKnee]: [0.56, 0.7], [LM.rightKnee]: [0.44, 0.7] });
    const k = kneeGap(lm, SQ);
    // (0.12 − 0.04) / 0.12 = 0.67
    expect(k.index).toBeCloseTo(0.67, 2);
    expect(k.ratio).toBeCloseTo(3, 2);
    expect(k.tendency).toBe("O");
    expect(k.grade).toBe("clear");
    expect(byKey(measureFront(lm, SQ), "kneeGap").note).toContain("O다리");
  });

  it("X다리: 무릎은 붙고 발목이 벌어짐", () => {
    const lm = front({ [LM.leftKnee]: [0.51, 0.7], [LM.rightKnee]: [0.49, 0.7], [LM.leftAnkle]: [0.54, 0.9], [LM.rightAnkle]: [0.46, 0.9] });
    const k = kneeGap(lm, SQ);
    // (0.02 − 0.08) / 0.12 = −0.5
    expect(k.index).toBeCloseTo(-0.5, 2);
    expect(k.tendency).toBe("X");
    expect(k.grade).toBe("clear");
  });

  it("무릎·발목이 고르면 경향 없음, 발목이 딱 붙어 간격 0 이면 배율은 null", () => {
    const lm = front({ [LM.leftAnkle]: [0.5, 0.9], [LM.rightAnkle]: [0.5, 0.9] });
    const k = kneeGap(lm, SQ);
    expect(k.ratio).toBeNull();
    expect(k.index).toBeCloseTo(0.5, 2);
    expect(kneeGap(front(), SQ).tendency).toBeNull();
  });
});

describe("측면", () => {
  it("귀가 어깨 바로 위: 0, 정상", () => {
    const ms = measureSide(side(0.5), SQ);
    expect(ms.map((m) => m.grade)).toEqual(["normal", "normal"]);
    expect(byKey(ms, "headForwardAngle").value).toBe(0);
    expect(qualityWarnings(side(0.5), SQ, "side")).toEqual([]);
  });

  it("귀가 앞으로 0.05 (세로 0.10): 약 26.6° → 뚜렷, 비율 0.05/0.28 ≈ 0.18 → 경미", () => {
    const info = sideInfo(side(0.55), SQ);
    expect(info.side).toBe("left");
    expect(info.facing).toBe(1);
    expect(info.forwardDeg).toBeCloseTo(26.6, 1);
    expect(info.forwardRatio).toBeCloseTo(0.18, 2);
    const ms = measureSide(side(0.55), SQ);
    expect(byKey(ms, "headForwardAngle").grade).toBe("clear");
    expect(byKey(ms, "headForwardRatio").grade).toBe("mild");
    expect(byKey(ms, "headForwardAngle").note).toContain("거북목 경향");
  });

  it("왼쪽을 보고 서도 같은 값 (좌우 대칭)", () => {
    const mirrored = side(0.55).map((l) => ({ ...l, x: 1 - l.x }));
    const info = sideInfo(mirrored, SQ);
    expect(info.facing).toBe(-1);
    expect(info.forwardDeg).toBeCloseTo(26.6, 1);
  });

  it("귀가 어깨보다 뒤면 음수, 정상 범위", () => {
    const ms = measureSide(side(0.47), SQ);
    expect(byKey(ms, "headForwardAngle").value).toBeLessThan(0);
    expect(byKey(ms, "headForwardAngle").grade).toBe("normal");
  });

  it("기준값 순서가 맞다 (경미 < 뚜렷)", () => {
    for (const t of Object.values(THRESHOLDS)) expect(t.mild).toBeLessThan(t.clear);
  });
});

describe("사진 품질 점검", () => {
  it("잘 안 보이는 관절", () => {
    const lm = front();
    lm[LM.leftKnee] = { ...lm[LM.leftKnee], visibility: 0.2 };
    expect(qualityWarnings(lm, SQ, "front").join()).toContain("잘 안 보여요");
  });
  it("발이 사진 밖", () => {
    const lm = front({ [LM.leftAnkle]: [0.52, 1.02], [LM.rightAnkle]: [0.48, 1.02] });
    expect(qualityWarnings(lm, SQ, "front").join()).toContain("사진 밖");
  });
  it("양발 높이가 다르면 카메라 기울기 의심", () => {
    const lm = front({ [LM.leftHeel]: [0.52, 0.96], [LM.rightHeel]: [0.48, 0.92] });
    expect(qualityWarnings(lm, SQ, "front").join()).toContain("카메라가 기울었거나");
  });
  it("몸이 너무 작음", () => {
    const lm = front({ [LM.leftAnkle]: [0.52, 0.4], [LM.rightAnkle]: [0.48, 0.4] });
    expect(qualityWarnings(lm, SQ, "front").join()).toContain("너무 작게");
  });
  it("정면 칸에 측면 사진, 측면 칸에 정면 사진", () => {
    expect(qualityWarnings(side(0.5), SQ, "front").join()).toContain("정면 사진이 맞나요");
    expect(qualityWarnings(front(), SQ, "side").join()).toContain("측면 사진이 맞나요");
  });
  it("랜드마크가 없으면 다시 찍기 안내", () => {
    expect(qualityWarnings([], SQ, "front")[0]).toContain("찾지 못했어요");
  });
});

describe("전후 비교 기록 (숫자만)", () => {
  it("저장 → 읽기 → 비교", () => {
    const before = makeRecord(measureFront(front({ [LM.leftShoulder]: [0.6, 0.2] }), SQ), "  4주 전  ", 1);
    const after = makeRecord(measureFront(front(), SQ), "오늘", 2);
    expect(before.memo).toBe("4주 전");
    const raw = JSON.stringify(appendRecord(appendRecord([], before), after));
    const list = parseRecords(raw);
    expect(list).toHaveLength(2);
    const d = compareRecords(list[0], list[1]);
    const sh = d.find((x) => x.key === "shoulderTilt")!;
    expect(sh.diff).toBeCloseTo(-5.7, 1);
    expect(sh.better).toBe(true);
    expect(d.find((x) => x.key === "hipTilt")!.better).toBeNull();
  });
  it("깨진 값은 버리고, 사진·이름 같은 다른 필드는 남기지 않는다", () => {
    expect(parseRecords("not json")).toEqual([]);
    expect(parseRecords(null)).toEqual([]);
    expect(parseRecords('{"a":1}')).toEqual([]);
    const list = parseRecords(JSON.stringify([{ at: 1, memo: "m", values: { shoulderTilt: 2, bogus: 3, hipTilt: "x" }, photo: "data:..." }, { at: "x" }]));
    expect(list).toEqual([{ at: 1, memo: "m", values: { shoulderTilt: 2 } }]);
  });
  it("최대 개수만 남긴다", () => {
    let list = parseRecords(null);
    for (let i = 0; i < 40; i++) list = appendRecord(list, { at: i, memo: "", values: {} });
    expect(list).toHaveLength(30);
    expect(list[0].at).toBe(10);
  });
  it("머리 전방: 뒤쪽(음수)끼리 바뀐 건 나아짐·나빠짐으로 치지 않는다", () => {
    const d = compareRecords({ at: 1, memo: "", values: { headForwardAngle: -5 } }, { at: 2, memo: "", values: { headForwardAngle: -1 } });
    expect(d[0].better).toBeNull();
  });
});
