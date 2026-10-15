// 고음 청력 테스트 릴스·광고 이미지 (10/15). 숫자는 /api/hearing-test 실제 통계(첫 응시 18명) 기준.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const S = "/tmp/claude-0/-home-user-label-republic/2f542779-1470-5d32-894d-8d1bf43ecb77/scratchpad/hear/promo/";
fs.mkdirSync(S, { recursive: true });
const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}*{box-sizing:border-box;margin:0}`;
const a = "#ffb547";
const page = (w, h, inner, pad = "150px 84px") => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${font}
body{width:${w}px;height:${h}px;font-family:P,"Noto Color Emoji",sans-serif;background:#121211;color:#f4f2ec;overflow:hidden;position:relative;padding:${pad}}
body:before{content:"";position:absolute;right:-260px;top:-200px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,${a}40,transparent 65%)}
.top{display:flex;justify-content:space-between;align-items:center;position:relative}
.brand{font-size:38px;font-weight:700;display:flex;gap:12px;align-items:center}.brand i{font-style:normal;background:#5f4a1f;border-radius:12px;padding:5px 11px;font-size:30px}
.tag{font-size:32px;font-weight:700;color:#121211;background:${a};border-radius:999px;padding:12px 26px}
.k{font-size:44px;font-weight:700;color:${a};position:relative}
h1{font-size:124px;line-height:1.1;font-weight:700;letter-spacing:-6px;margin-top:22px;position:relative}h1 em{font-style:normal;color:${a}}
.sub{font-size:46px;line-height:1.5;color:#c9c5bb;margin-top:40px;position:relative}
.big{font-size:300px;font-weight:700;line-height:1;text-align:center;position:relative;color:${a};letter-spacing:-10px}.big small{font-size:110px;letter-spacing:0}
.wave{height:220px;margin-top:50px;position:relative}
.bar{height:40px;border-radius:20px;background:#2a2a28;margin-top:60px;position:relative;overflow:hidden}.bar b{display:block;height:100%;background:${a};border-radius:20px}
.pct{font-size:52px;font-weight:700;text-align:center;margin-top:30px;position:relative}
.cta{display:inline-block;font-size:50px;font-weight:700;background:${a};color:#121211;border-radius:999px;padding:30px 54px;margin-top:60px;position:relative}
.note{font-size:34px;line-height:1.5;color:#a9a59c;margin-top:30px;position:relative}
.ladder{margin-top:36px;position:relative;display:grid;gap:10px}.ladder div{display:flex;align-items:center;gap:20px;font-size:40px;font-weight:700}
.ladder span{width:170px;text-align:right}.ladder i{flex:1;height:30px;border-radius:15px;background:#2a2a28;overflow:hidden}.ladder i b{display:block;height:100%;background:${a}}
</style></head><body>${inner}</body></html>`;
const top = `<div class="top"><div class="brand"><i>🏠</i>노방장</div><span class="tag">🦟 고음 청력 테스트</span></div>`;
// 사인파 모양: 주파수가 높을수록 촘촘하게
const sine = (cycles) => {
  const pts = Array.from({ length: 400 }, (_, i) => `${(i / 399) * 912},${110 + 90 * Math.sin((i / 399) * cycles * 2 * Math.PI)}`).join(" ");
  return `<svg class="wave" width="912" height="220" viewBox="0 0 912 220"><polyline points="${pts}" fill="none" stroke="${a}" stroke-width="6" stroke-linejoin="round"/></svg>`;
};
// 실제 통계 (첫 응시 18명): 주파수별 들은 비율
const STATS = { 8: 100, 12: 100, 15: 89, 17: 67, 18: 44, 20: 39 };
const step = (khz, cycles) => [1080, 1920, `${top}<div style="height:260px"></div><div class="k" style="text-align:center">▶ 지금 나오는 소리</div>
  <div class="big" style="margin-top:30px">${khz}<small>kHz</small></div>${sine(cycles)}
  <div class="bar"><b style="width:${STATS[khz]}%"></b></div><div class="pct">노방장 응시자 <span style="color:${a}">${STATS[khz]}%</span>가 들었어요</div><div class="note" style="text-align:center">첫 응시 18명 기준</div>`];
const ladder = [8, 12, 15, 17, 18, 20].map((k) => `<div><span>${k}kHz</span><i><b style="width:${STATS[k]}%"></b></i><span style="width:110px;text-align:left">${STATS[k]}%</span></div>`).join("");
const frames = {
  "ad-hearing-test-1080x1350": [1080, 1350, `${top}<div style="height:50px"></div><div class="k">이어폰 끼고 1분</div><h1>모기 소리,<br><em>어디까지 들려요?</em></h1>
    <div class="sub">8kHz부터 20kHz까지 한 칸씩.<br>소리 난 쪽(A·B)을 맞히면 다음 단계</div>
    <div class="ladder">${ladder}</div><div class="note">노방장 첫 응시 18명 기준 · 청력 진단이 아니에요</div><div class="cta" style="margin-top:36px">내 귀 확인하기 →</div>`, "84px 80px"],
  hf0: [1080, 1920, `${top}<div style="height:300px"></div><div class="k">🎧 이어폰 끼고, 볼륨은 작게</div><h1>이 소리,<br><em>어디까지<br>들려요?</em></h1><div class="sub">점점 높아져요.<br>안 들리기 시작하는 곳을 기억하세요 🦟</div>`],
  hf1: step(8, 6),
  hf2: step(12, 9),
  hf3: step(15, 12),
  hf4: step(17, 15),
  hf5: [1080, 1920, `${top}<div style="height:240px"></div><div class="k">어디서 끊겼어요?</div><h1>18kHz부터는<br><em>절반 넘게<br>못 들어요</em></h1>
    <div class="note">인스타는 압축 때문에 높은 소리가 잘릴 수 있어요.<br>20kHz까지 정확한 테스트는 링크에서 👇</div>
    <div class="cta">👉 프로필 링크</div><div class="note">nobangjang.com/hearing-test · 청력 진단이 아니에요</div>`],
};
const b = await chromium.launch(); const p = await b.newPage();
for (const [name, [w, h, inner, pad]] of Object.entries(frames)) {
  await p.setViewportSize({ width: w, height: h });
  fs.writeFileSync(`${S}${name}.html`, page(w, h, inner, pad));
  await p.goto(`file://${S}${name}.html`); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${S}${name}.png` });
}
await b.close();
