/**
 * 🔊 미니게임 소리 (10/30 대표님 "승부차기 게임에 소리는 없어?"). 파일 없이 브라우저에서 바로 만든다(저작권 걱정 없음).
 * 첫 탭 뒤에만 소리가 난다(브라우저 규칙). 끄기는 이 브라우저에 기억한다.
 */
export const SOUND_KEY = "lr:gameSound";

let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {}
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !soundOn()) return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(a: AudioContext, sec: number): AudioBufferSourceNode {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * sec), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

/** 소리 하나: 시작·끝 음량을 짧게 감싸 딱딱 끊기지 않게 */
function env(a: AudioContext, peak: number, attack: number, hold: number, release: number): GainNode {
  const g = a.createGain();
  const t = a.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  g.connect(a.destination);
  return g;
}

/** 휘슬 (시작·끝) */
export function whistle(long = false): void {
  const a = audio();
  if (!a) return;
  const len = long ? 0.7 : 0.25;
  const o = a.createOscillator();
  o.type = "sine";
  o.frequency.value = 2600;
  const lfo = a.createOscillator();
  lfo.frequency.value = 28;
  const depth = a.createGain();
  depth.gain.value = 90;
  lfo.connect(depth).connect(o.frequency);
  o.connect(env(a, 0.12, 0.01, len, 0.08));
  o.start();
  lfo.start();
  o.stop(a.currentTime + len + 0.12);
  lfo.stop(a.currentTime + len + 0.12);
}

/** 공 차는 소리: 낮은 "퍽" */
export function kickSound(): void {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(160, a.currentTime);
  o.frequency.exponentialRampToValueAtTime(45, a.currentTime + 0.14);
  o.connect(env(a, 0.6, 0.004, 0.02, 0.16));
  o.start();
  o.stop(a.currentTime + 0.25);
  const n = noise(a, 0.05);
  const f = a.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 1800;
  n.connect(f).connect(env(a, 0.15, 0.002, 0.005, 0.04));
  n.start();
}

/** 그물 "촥" */
export function netSound(): void {
  const a = audio();
  if (!a) return;
  const n = noise(a, 0.4);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(3200, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(900, a.currentTime + 0.35);
  n.connect(f).connect(env(a, 0.35, 0.01, 0.05, 0.3));
  n.start();
}

/** 관중 함성 (기쁠 때) */
export function cheer(): void {
  const a = audio();
  if (!a) return;
  const n = noise(a, 1.6);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1100;
  f.Q.value = 0.6;
  n.connect(f).connect(env(a, 0.28, 0.25, 0.55, 0.7));
  n.start();
}

/** 관중 "아~" (아쉬울 때) */
export function groan(): void {
  const a = audio();
  if (!a) return;
  const n = noise(a, 1.1);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(520, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(240, a.currentTime + 0.9);
  n.connect(f).connect(env(a, 0.3, 0.08, 0.3, 0.6));
  n.start();
}

/** 게이지·반사신경을 멈출 때 "틱" */
export function tick(): void {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  o.type = "square";
  o.frequency.value = 880;
  o.connect(env(a, 0.06, 0.002, 0.01, 0.05));
  o.start();
  o.stop(a.currentTime + 0.08);
}
