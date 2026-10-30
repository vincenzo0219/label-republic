/**
 * 🔊 미니게임 소리 (10/30 대표님 "승부차기 게임에 소리는 없어?"). 파일 없이 브라우저에서 바로 만든다(저작권 걱정 없음).
 * 첫 탭 뒤에만 소리가 난다(브라우저 규칙). 끄기는 이 브라우저에 기억한다.
 */
export const SOUND_KEY = "lr:gameSound";

let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return soundOnFrom(window.localStorage.getItem(SOUND_KEY));
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {}
}

/** 그 자리에서 쓰는 순수 판단 (테스트용): 저장값 → 켜짐 여부 */
export const soundOnFrom = (stored: string | null): boolean => stored !== "off";

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

/* ───────── 10/30 대표님 "모든 게임에 음악이나 소리" ───────── */

const listeners = new Set<(on: boolean) => void>();
/** 🔊/🔇 바뀌면 알림 (음악 멈추기·버튼 모양) */
export function onSoundChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function toggleSound(): boolean {
  const on = !soundOn();
  setSoundOn(on);
  if (!on) stopMusic();
  listeners.forEach((f) => f(on));
  return on;
}

/** 음 하나: 반음 n 개 위 (A4 = 440Hz 기준, 순수 계산이라 테스트한다) */
export const noteHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

function tone(freq: number, len: number, type: OscillatorType = "sine", vol = 0.12, at = 0, slideTo?: number): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

function noiseHit(len: number, type: BiquadFilterType, from: number, to: number, vol: number): void {
  const a = audio();
  if (!a) return;
  const n = noise(a, len + 0.05);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(from, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(to, a.currentTime + len);
  n.connect(f).connect(env(a, vol, 0.005, len * 0.3, len * 0.7));
  n.start();
}

/** 버튼 누를 때 부드러운 "톡" */
export const softTap = () => tone(660, 0.07, "triangle", 0.08, 0, 520);
/** 톡 튀는 "뽁" */
export const pop = () => tone(520, 0.09, "sine", 0.16, 0, 980);
/** 준비 "삐" */
export const readyBeep = () => tone(740, 0.12, "square", 0.05);
/** 시작 "삐!" (높게) */
export const goBeep = () => tone(1320, 0.18, "square", 0.08);
/** 너무 빨라요 "부웅" */
export const errorBuzz = () => tone(140, 0.28, "sawtooth", 0.08, 0, 90);
/** 반짝 (맞혔을 때·투표했을 때) */
export function sparkle(): void {
  [1568, 2093, 2637].forEach((f, i) => tone(f, 0.16, "triangle", 0.06, i * 0.06));
}
/** 딩동 (라운드 올라갈 때) */
export function chime(): void {
  tone(1047, 0.25, "sine", 0.1);
  tone(1319, 0.3, "sine", 0.08, 0.09);
}
/** 빠바밤! (최고 기록·우승·승리) */
export function fanfare(): void {
  [523, 659, 784].forEach((f, i) => tone(f, 0.14, "square", 0.06, i * 0.1));
  tone(1047, 0.45, "square", 0.07, 0.3);
  tone(784, 0.45, "triangle", 0.05, 0.3);
}
/** 카드 고를 때 "휙" */
export const whoosh = () => noiseHit(0.22, "bandpass", 600, 3200, 0.22);
/** 넘칠 때 "철퍽" */
export function splash(): void {
  noiseHit(0.45, "lowpass", 2400, 300, 0.35);
  tone(220, 0.2, "sine", 0.1, 0, 90);
}
/** 랠리 "퐁": 이어 받을수록 음이 올라간다 */
export const pong = (hits: number) => tone(Math.min(1400, 520 * 2 ** (hits / 14)), 0.1, "sine", 0.2, 0, Math.min(1600, 600 * 2 ** (hits / 14)));
/** 놓쳤을 때 "툭" */
export const thud = () => tone(110, 0.22, "sine", 0.25, 0, 55);

/** ☕ 따르는 "쏴아": 누르는 동안 계속, 찰수록 소리가 높아진다 */
let pourNode: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
export function pourStart(): void {
  const a = audio();
  if (!a || pourNode) return;
  const src = noise(a, 2);
  src.loop = true;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 500;
  filter.Q.value = 2;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, a.currentTime + 0.08);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
  pourNode = { src, filter, gain };
}
/** fill 0~100 → 500Hz ~ 2400Hz */
export const pourHz = (fill: number): number => 500 + (Math.max(0, Math.min(100, fill)) / 100) * 1900;
export function pourUpdate(fill: number): void {
  if (!pourNode || !ctx) return;
  pourNode.filter.frequency.setTargetAtTime(pourHz(fill), ctx.currentTime, 0.05);
}
export function pourStop(): void {
  if (!pourNode || !ctx) return;
  const { src, gain } = pourNode;
  gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
  src.stop(ctx.currentTime + 0.2);
  pourNode = null;
}

/* ───────── 배경 음악: 게임마다 다른 짧은 8비트 반복 (작게, 게임 중에만) ───────── */

export type Theme = { bpm: number; root: number; steps: (number | null)[]; bass: number[]; wave: OscillatorType };
/** steps: 16분음표마다 root 에서 반음 몇 개 위 (null = 쉼) / bass: 마디마다 반음 */
export const THEMES: Record<string, Theme> = {
  reaction: { bpm: 132, root: 72, wave: "square", steps: [0, null, 7, null, 12, null, 7, null, 3, null, 10, null, 15, null, 10, null], bass: [0, -4] },
  worldcup: { bpm: 104, root: 69, wave: "triangle", steps: [0, 4, 7, 12, null, 7, 4, null, 2, 5, 9, 14, null, 9, 5, null], bass: [0, -7] },
  latte: { bpm: 92, root: 67, wave: "triangle", steps: [0, null, 4, 7, null, 11, null, 7, 2, null, 5, 9, null, 12, null, 9], bass: [0, 5] },
  rally: { bpm: 140, root: 74, wave: "square", steps: [0, 7, 12, 7, 0, 7, 12, 7, -2, 5, 10, 5, -2, 5, 10, 5], bass: [0, -2] },
  pk: { bpm: 120, root: 70, wave: "square", steps: [0, null, 0, 7, null, 7, 5, 4, 0, null, 0, 7, null, 12, 10, 7], bass: [0, -5] },
};
/** 16분음표 길이(초) */
export const stepSec = (bpm: number): number => 60 / bpm / 4;
/** n번째 16분음표의 멜로디·베이스 음 (순수 계산, 테스트한다) */
export function themeNote(t: Theme, n: number): { lead: number | null; bass: number | null } {
  const i = n % t.steps.length;
  const s = t.steps[i];
  const bar = Math.floor(n / t.steps.length) % t.bass.length;
  return { lead: s === null || s === undefined ? null : t.root + s, bass: i % 4 === 0 ? t.root - 24 + t.bass[bar]! : null };
}

let music: { timer: ReturnType<typeof setInterval>; gain: GainNode; theme: Theme; next: number; n: number } | null = null;
let musicWanted: string | null = null;

function scheduleMusic(): void {
  if (!music || !ctx) return;
  const m = music;
  const ahead = ctx.currentTime + 0.12;
  while (m.next < ahead) {
    const { lead, bass } = themeNote(m.theme, m.n);
    const len = stepSec(m.theme.bpm) * 0.9;
    for (const [midi, wave, vol] of [[lead, m.theme.wave, 0.5], [bass, "triangle", 0.7]] as const) {
      if (midi === null) continue;
      const o = ctx.createOscillator();
      o.type = wave as OscillatorType;
      o.frequency.value = noteHz(midi);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, m.next);
      g.gain.exponentialRampToValueAtTime(vol, m.next + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, m.next + len);
      o.connect(g).connect(m.gain);
      o.start(m.next);
      o.stop(m.next + len + 0.02);
    }
    m.next += stepSec(m.theme.bpm);
    m.n += 1;
  }
}

/** 배경 음악 시작 (사용자가 탭한 뒤에 불러야 소리가 난다). 소리 끔이면 아무것도 안 한다 */
export function startMusic(id: string): void {
  musicWanted = id;
  const theme = THEMES[id];
  const a = audio();
  if (!a || !theme || music) return;
  const gain = a.createGain();
  gain.gain.value = 0.06; // 약 -24dB
  gain.connect(a.destination);
  music = { timer: setInterval(scheduleMusic, 25), gain, theme, next: a.currentTime + 0.05, n: 0 };
  scheduleMusic();
}

export function stopMusic(keepWanted = false): void {
  if (!keepWanted) musicWanted = null;
  if (!music) return;
  clearInterval(music.timer);
  const g = music.gain;
  try {
    g.gain.setTargetAtTime(0.0001, g.context.currentTime, 0.05);
    setTimeout(() => g.disconnect(), 400);
  } catch {}
  music = null;
}

// 다른 탭으로 가면 음악 멈춤, 돌아오면 이어서
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      const w = musicWanted;
      stopMusic();
      musicWanted = w;
    } else if (musicWanted) startMusic(musicWanted);
  });
}
