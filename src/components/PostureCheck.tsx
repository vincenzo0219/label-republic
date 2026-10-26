"use client";

import { useEffect, useRef, useState } from "react";
import {
  DISCLAIMER,
  GRADE_LABEL,
  LM,
  MEDIAPIPE_BUNDLE_URL,
  MEDIAPIPE_WASM_URL,
  MEMO_MAX,
  METRIC_LABEL,
  METRIC_UNIT,
  POSE_LINKS,
  POSE_MODEL_URL,
  STORAGE_KEY,
  appendRecord,
  compareRecords,
  makeRecord,
  measureFront,
  measureSide,
  parseRecords,
  qualityWarnings,
  sideInfo,
  type Landmark,
  type Metric,
  type PostureRecord,
  type View,
} from "@/lib/posture";

/** 분석용으로 줄이는 긴 변 (원본 사진은 어디에도 보내지 않는다) */
const MAX_SIDE = 1280;

type PoseLandmarkerLike = { detect: (img: HTMLCanvasElement) => { landmarks?: Landmark[][] } };

let landmarkerP: Promise<PoseLandmarkerLike> | null = null;
/** MediaPipe 는 이 페이지에서 사진을 처음 고를 때만 CDN 에서 받는다 (번들에 넣지 않음) */
function loadLandmarker(): Promise<PoseLandmarkerLike> {
  landmarkerP ??= (async () => {
    const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ MEDIAPIPE_BUNDLE_URL);
    const fileset = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
    return (await mod.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "CPU" },
      runningMode: "IMAGE",
      numPoses: 1,
    })) as PoseLandmarkerLike;
  })().catch((e) => {
    landmarkerP = null;
    throw e;
  });
  return landmarkerP;
}

type Shot = { status: "idle" | "loading" | "done" | "error"; message?: string; metrics?: Metric[]; warnings?: string[] };
const IDLE: Shot = { status: "idle" };

function readRecords(): PostureRecord[] {
  try {
    return parseRecords(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}
function writeRecords(list: PostureRecord[]): boolean {
  try {
    if (list.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 겹쳐 그리기
// ---------------------------------------------------------------------------
function draw(ctx: CanvasRenderingContext2D, lm: Landmark[], view: View) {
  const { width: w, height: h } = ctx.canvas;
  const u = Math.max(2, Math.round(Math.max(w, h) / 320));
  const P = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, color: string, width: number, dash: number[] = []) => {
    ctx.save();
    ctx.setLineDash(dash);
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = width + u;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  };
  const extend = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return [{ x: a.x - dx * k, y: a.y - dy * k }, { x: b.x + dx * k, y: b.y + dy * k }] as const;
  };
  const horizontal = (y: number, cx: number, half: number) => line({ x: cx - half, y }, { x: cx + half, y }, "rgba(255,255,255,0.9)", u, [u * 3, u * 2]);

  for (const [a, b] of POSE_LINKS) line(P(a), P(b), "#4fb38f", u);

  if (view === "front") {
    const pairs: [number, number][] = [
      [LM.leftEar, LM.rightEar],
      [LM.leftShoulder, LM.rightShoulder],
      [LM.leftHip, LM.rightHip],
    ];
    for (const [l, r] of pairs) {
      const a = P(l);
      const b = P(r);
      const half = Math.abs(a.x - b.x) * 0.9;
      horizontal((a.y + b.y) / 2, (a.x + b.x) / 2, half);
      const [s, e] = extend(a, b, 0.35);
      line(s, e, "#fde047", u * 1.5);
    }
    line(P(LM.leftKnee), P(LM.rightKnee), "#fb923c", u, [u * 2, u * 2]);
    line(P(LM.leftAnkle), P(LM.rightAnkle), "#fb923c", u, [u * 2, u * 2]);
  } else {
    const info = sideInfo(lm, { width: w, height: h });
    const ear = P(info.side === "left" ? LM.leftEar : LM.rightEar);
    const sh = P(info.side === "left" ? LM.leftShoulder : LM.rightShoulder);
    const len = Math.max(sh.y - ear.y, h * 0.08) * 1.3;
    line(sh, { x: sh.x, y: sh.y - len }, "rgba(255,255,255,0.9)", u, [u * 3, u * 2]);
    line(sh, ear, "#fde047", u * 1.5);
  }

  for (let i = 0; i < lm.length; i++) {
    if (i > 10 && i < 33 && (i < 17 || i > 22)) {
      const p = P(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, u * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = (lm[i].visibility ?? 1) < 0.5 ? "#f87171" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = u * 0.8;
      ctx.strokeStyle = "#1f5f4a";
      ctx.stroke();
    }
  }
  for (const i of [LM.leftEar, LM.rightEar, LM.nose]) {
    const p = P(i);
    ctx.beginPath();
    ctx.arc(p.x, p.y, u * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = "#fde047";
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// 화면
// ---------------------------------------------------------------------------
const VIEWS: { view: View; label: string; tip: string }[] = [
  { view: "front", label: "정면 사진", tip: "발뒤꿈치를 모으고 팔은 편하게 내려요" },
  { view: "side", label: "측면 사진", tip: "옆으로 서서 앞을 보고 평소처럼 서요" },
];

const fmt = (k: keyof typeof METRIC_UNIT, v: number) => `${v.toFixed(METRIC_UNIT[k] === "°" ? 1 : 2)}${METRIC_UNIT[k]}`;
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};

function ShotBox({ view, label, tip, shot, onFile, canvasRef }: {
  view: View;
  label: string;
  tip: string;
  shot: Shot;
  onFile: (f: File) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onFile(f);
  };
  return (
    <section className="pc-shot" aria-labelledby={`pc-${view}`}>
      <h2 id={`pc-${view}`} className="pc-h2">{label}</h2>
      <p className="hint">{tip}</p>
      <div className="pc-pick">
        <label className="btn btn-primary">
          📷 찍기
          <input type="file" accept="image/*" capture="environment" onChange={pick} hidden />
        </label>
        <label className="btn">
          🖼️ 앨범에서
          <input type="file" accept="image/*" onChange={pick} hidden />
        </label>
      </div>
      <div className="pc-canvas" hidden={shot.status === "idle"}>
        <canvas ref={canvasRef} aria-label={`${label} 위 관절점과 기준선`} />
        {shot.status === "loading" && <div className="pc-busy">{shot.message ?? "분석 중…"}</div>}
      </div>
      {shot.status === "error" && <p className="error" role="alert">{shot.message}</p>}
      {shot.warnings && shot.warnings.length > 0 && (
        <ul className="pc-warn" role="status">
          {shot.warnings.map((w) => <li key={w}>⚠️ {w}</li>)}
        </ul>
      )}
      {shot.metrics && (
        <ul className="pc-metrics" aria-live="polite">
          {shot.metrics.map((m) => (
            <li key={m.key}>
              <div className="pc-mrow">
                <b>{m.label}</b>
                <span className="pc-val">{m.display}</span>
                <span className={`pc-badge pc-${m.grade}`}>{GRADE_LABEL[m.grade]}</span>
              </div>
              <p className="pc-mnote">{m.note}</p>
            </li>
          ))}
        </ul>
      )}
      {shot.metrics && view === "side" && <p className="hint">측면 값은 목뼈(C7) 점이 없어 어깨점으로 잰 근사치예요.</p>}
    </section>
  );
}

export function PostureCheck() {
  const [shots, setShots] = useState<Record<View, Shot>>({ front: IDLE, side: IDLE });
  const [records, setRecords] = useState<PostureRecord[]>([]);
  const [memo, setMemo] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState(false);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const sideRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => setRecords(readRecords()), []);

  const run = async (view: View, file: File) => {
    const set = (s: Shot) => setShots((prev) => ({ ...prev, [view]: s }));
    setSavedAt(null);
    set({ status: "loading", message: "사진 여는 중…" });
    const canvas = (view === "front" ? frontRef : sideRef).current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return set({ status: "error", message: "이 브라우저에서는 열 수 없어요" });
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return set({ status: "error", message: "이 사진은 열 수 없어요. JPG·PNG 사진으로 다시 골라 주세요" });
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();

    set({ status: "loading", message: landmarkerP ? "분석 중…" : "분석 도구 받는 중… (처음 한 번)" });
    let lm: Landmark[] | undefined;
    try {
      const landmarker = await loadLandmarker();
      set({ status: "loading", message: "분석 중…" });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      lm = landmarker.detect(canvas).landmarks?.[0];
    } catch {
      return set({ status: "error", message: "분석 도구를 받지 못했어요. 인터넷 연결을 확인하고 다시 골라 주세요" });
    }
    if (!lm || lm.length < 33) return set({ status: "error", message: "사람을 찾지 못했어요. 전신이 보이게 다시 찍어 주세요" });

    const size = { width: canvas.width, height: canvas.height };
    draw(ctx, lm, view);
    set({
      status: "done",
      metrics: view === "front" ? measureFront(lm, size) : measureSide(lm, size),
      warnings: qualityWarnings(lm, size, view),
    });
  };

  const current = [...(shots.front.metrics ?? []), ...(shots.side.metrics ?? [])];
  const hasResult = current.length > 0;
  const prev = savedAt ? records[records.length - 2] : records[records.length - 1];
  const now = savedAt ? records[records.length - 1] : hasResult ? makeRecord(current, memo, Date.now()) : null;
  const deltas = prev && now ? compareRecords(prev, now) : [];

  const save = () => {
    const rec = makeRecord(current, memo, Date.now());
    const next = appendRecord(records, rec);
    if (!writeRecords(next)) return setSaveError(true);
    setSaveError(false);
    setRecords(next);
    setSavedAt(rec.at);
    setMemo("");
  };
  const clearAll = () => {
    if (!confirm("저장한 자세 체크 기록을 모두 지울까요?")) return;
    writeRecords([]);
    setRecords([]);
    setSavedAt(null);
  };

  return (
    <div className="ear-card pc">
      <p className="ear-kicker">🧘 요가·필라테스 강사용</p>
      <h1 className="ear-title">📸 사진 2장 자세 체크</h1>
      <p className="pc-lead">정면·측면 사진 2장으로 어깨·골반 높이 차, 머리 기울기, 다리 모양, 거북목 경향을 숫자로 봐요.</p>
      <p className="pc-privacy">🔒 사진은 이 기기 안에서만 분석하고 어디에도 올리지 않아요. 저장하는 건 숫자뿐이에요.</p>
      <p className="pc-disclaimer" role="note">⚕️ {DISCLAIMER}</p>

      <section className="pc-guide" aria-labelledby="pc-guide">
        <h2 id="pc-guide" className="pc-h2">찍기 전에</h2>
        <ol className="ear-how">
          <li>몸에 붙는 옷을 입어요</li>
          <li>카메라를 허리 높이에 수평으로 들어요</li>
          <li>2~3m 떨어져서 찍어요</li>
          <li>머리부터 발끝까지 전신이 보이게 찍어요</li>
          <li>밝은 곳에서 찍어요</li>
        </ol>
        <p className="hint">처음 한 번은 분석 도구(약 10MB)를 받아요. 와이파이에서 쓰면 좋아요.</p>
      </section>

      {VIEWS.map((v) => (
        <ShotBox key={v.view} {...v} shot={shots[v.view]} onFile={(f) => run(v.view, f)} canvasRef={v.view === "front" ? frontRef : sideRef} />
      ))}

      {hasResult && (
        <section className="pc-save" aria-labelledby="pc-save">
          <h2 id="pc-save" className="pc-h2">전후 비교</h2>
          <p className="pc-disclaimer" role="note">⚕️ {DISCLAIMER}</p>
          <p className="hint">기준값은 선별용 참고치예요. 사진 각도·옷·서 있는 자세에 따라 달라져요.</p>
          {!savedAt && (
            <div className="pc-saverow">
              <input
                className="input"
                value={memo}
                maxLength={MEMO_MAX}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모 (예: 4주 차, 수업 전)"
                aria-label="기록 메모"
              />
              <button type="button" className="btn btn-primary" onClick={save}>숫자만 저장</button>
            </div>
          )}
          <p className="hint">회원 이름 대신 메모만 적어 주세요. 이 브라우저에만 숫자가 저장돼요.</p>
          {saveError && <p className="error" role="alert">저장하지 못했어요. 브라우저 설정에서 사이트 데이터 저장을 허용해 주세요</p>}
          {savedAt && <p className="pc-ok" role="status">저장했어요.</p>}

          {prev && deltas.length > 0 && (
            <div className="pc-compare">
              <p className="pc-cmp-title">
                {ymd(prev.at)}{prev.memo ? ` (${prev.memo})` : ""} → {savedAt ? "방금 저장" : "지금"}
              </p>
              <table className="data-table">
                <thead>
                  <tr><th>항목</th><th>전</th><th>후</th><th>변화</th></tr>
                </thead>
                <tbody>
                  {deltas.map((d) => (
                    <tr key={d.key}>
                      <td>{METRIC_LABEL[d.key]}</td>
                      <td>{fmt(d.key, d.before)}</td>
                      <td>{fmt(d.key, d.after)}</td>
                      <td className={d.better === null ? undefined : d.better ? "pc-better" : "pc-worse"}>
                        {d.better === null ? "비슷" : d.better ? "고른 쪽" : "커짐"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {records.length > 0 && (
        <details className="pc-records">
          <summary>저장한 기록 {records.length}개</summary>
          <ul>
            {[...records].reverse().map((r) => (
              <li key={r.at}>{ymd(r.at)} {r.memo || "메모 없음"}</li>
            ))}
          </ul>
          <button type="button" className="btn btn-sm btn-danger" onClick={clearAll}>기록 모두 지우기</button>
        </details>
      )}
    </div>
  );
}
