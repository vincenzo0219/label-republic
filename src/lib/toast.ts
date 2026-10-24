/** 화면 아래 짧은 알림 한 줄 (React 밖에서도 쓰게 DOM 으로). 같은 때 하나만 */
export function toast(text: string, ms = 1500) {
  try {
    document.querySelectorAll(".nb-toast[data-global]").forEach((el) => el.remove());
    const el = document.createElement("span");
    el.className = "nb-toast";
    el.dataset.global = "1";
    el.setAttribute("role", "status");
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  } catch {}
}
