/**
 * 🤌 손맛 (10/30 대표님 "손맛을 더 강하게 느끼게 해줘"): 진동 · 화면 흔들림 · 튀는 버튼 · 탭 자리 파편 · 떠오르는 글자.
 * 움직임 줄이기 설정이면 흔들림·파편·글자는 빼고 짧은 진동만 (소리는 gameSound 쪽에서 그대로).
 * 아이폰은 진동이 없어서 눈에 보이는 효과와 소리가 손맛을 맡는다.
 */
export const VIBE = {
  tap: 15,
  hit: [20, 30, 40],
  big: [30, 40, 60],
  win: [40, 60, 40, 60, 90],
  bad: [70, 50, 70],
} as const;

export function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function vibe(p: number | readonly number[]): void {
  try {
    const pattern = reducedMotion() ? (typeof p === "number" ? Math.min(p, 15) : 15) : (p as number | number[]);
    navigator.vibrate?.(pattern);
  } catch {}
}

/** 화면(게임 칸) 흔들기 */
export function shake(el: Element | null | undefined, strong = false): void {
  if (!el || reducedMotion()) return;
  el.classList.remove("fx-shake", "fx-shake-big");
  void (el as HTMLElement).offsetWidth; // 같은 효과를 다시 걸기 위한 한 번의 읽기
  el.classList.add(strong ? "fx-shake-big" : "fx-shake");
  setTimeout(() => el.classList.remove("fx-shake", "fx-shake-big"), strong ? 260 : 160);
}

/** 눌린 버튼이 0.92 → 1.08 로 튀어나오기 */
export function popEl(el: Element | null | undefined): void {
  if (!el || reducedMotion()) return;
  el.classList.remove("fx-pop");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("fx-pop");
  setTimeout(() => el.classList.remove("fx-pop"), 320);
}

const COLORS = ["#ff6b5f", "#ffb357", "#3ddc97", "#5fd3ff", "#c79bff", "#ffd84d"];

/** 탭한 자리에 작은 파편 n 개 */
export function burst(x: number, y: number, n = 10, colors: readonly string[] = COLORS): void {
  if (typeof document === "undefined" || reducedMotion()) return;
  const box = document.createElement("span");
  box.className = "fx-burst";
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  for (let i = 0; i < n; i++) {
    const d = document.createElement("i");
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 28 + Math.random() * 34;
    d.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    d.style.setProperty("--dy", `${Math.sin(ang) * dist}px`);
    d.style.background = colors[i % colors.length]!;
    box.appendChild(d);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 600);
}

/** 탭한 자리에서 위로 떠오르는 글자 ("+1", "완벽!") */
export function floatText(x: number, y: number, text: string): void {
  if (typeof document === "undefined" || reducedMotion()) return;
  const el = document.createElement("span");
  el.className = "fx-float";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/** 이벤트에서 탭 자리(화면 좌표). 키보드로 눌렀으면 그 요소 가운데 */
export function pointOf(e: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }): { x: number; y: number } {
  if (e.clientX || e.clientY) return { x: e.clientX!, y: e.clientY! };
  const el = e.currentTarget as Element | null;
  const r = el?.getBoundingClientRect?.();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
}

/** 버튼 한 번 누를 때 한꺼번에: 튀기 + 파편 + 진동 */
export function pressFx(e: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }, n = 8): void {
  const { x, y } = pointOf(e);
  popEl(e.currentTarget as Element | null);
  burst(x, y, n);
  vibe(VIBE.tap);
}
