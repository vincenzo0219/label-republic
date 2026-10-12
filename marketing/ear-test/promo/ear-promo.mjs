import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const S = "/tmp/claude-0/-home-user-label-republic/2f542779-1470-5d32-894d-8d1bf43ecb77/scratchpad/ear/promo/";
fs.mkdirSync(S, { recursive: true });
const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}*{box-sizing:border-box;margin:0}`;
const a = "#4fd1a5";
const page = (w, h, inner, pad = "150px 84px") => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${font}
body{width:${w}px;height:${h}px;font-family:P,"Noto Color Emoji",sans-serif;background:#121211;color:#f4f2ec;overflow:hidden;position:relative;padding:${pad}}
body:before{content:"";position:absolute;right:-260px;top:-200px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,${a}44,transparent 65%)}
.top{display:flex;justify-content:space-between;align-items:center;position:relative}
.brand{font-size:38px;font-weight:700;display:flex;gap:12px;align-items:center}.brand i{font-style:normal;background:#1f5f4a;border-radius:12px;padding:5px 11px;font-size:30px}
.tag{font-size:32px;font-weight:700;color:#121211;background:${a};border-radius:999px;padding:12px 26px}
.k{font-size:44px;font-weight:700;color:${a};position:relative}
h1{font-size:124px;line-height:1.1;font-weight:700;letter-spacing:-6px;margin-top:22px;position:relative}h1 em{font-style:normal;color:${a}}
.sub{font-size:46px;line-height:1.5;color:#c9c5bb;margin-top:40px;position:relative}
.big{font-size:330px;font-weight:700;line-height:1;text-align:center;position:relative;color:${a}}
.wave{display:flex;gap:14px;justify-content:center;align-items:center;height:260px;margin-top:40px;position:relative}.wave span{width:22px;border-radius:11px;background:${a}}
.cta{display:inline-block;font-size:50px;font-weight:700;background:${a};color:#121211;border-radius:999px;padding:30px 54px;margin-top:70px;position:relative}
.note{font-size:34px;color:#a9a59c;margin-top:30px;position:relative}
.chips{display:flex;gap:16px;flex-wrap:wrap;margin-top:60px;position:relative}.chips span{font-size:40px;font-weight:700;background:#232321;border:2px solid #3a3a37;border-radius:999px;padding:18px 30px}
</style></head><body>${inner}</body></html>`;
const top = `<div class="top"><div class="brand"><i>🏠</i>노방장</div><span class="tag">🎧 황금귀 테스트</span></div>`;
const wave = (n, seed) => `<div class="wave">${Array.from({ length: n }, (_, i) => `<span style="height:${40 + Math.abs(Math.sin(i * 1.7 + seed)) * 200}px"></span>`).join("")}</div>`;
const frames = {
  // 광고·피드용 4:5
  "ad-ear-test-1080x1350": [1080, 1350, `${top}<div style="height:110px"></div><div class="k">1분 블라인드 테스트</div><h1>당신 귀,<br><em>상위 몇 %?</em></h1>
    <div class="sub">원본 vs MP3 압축본, 10문제.<br>뒤로 갈수록 어려워져요 (64→192kbps)</div>
    <div class="chips"><span>🎧 평범한 귀</span><span>👂 예민한 귀</span><span>🔥 덕후 귀</span><span>🏆 황금귀</span></div>
    <div class="cta">지금 테스트하기 →</div>`, "84px 80px"],
  // 릴스 프레임 1080×1920
  "rf0": [1080, 1920, `${top}<div style="height:300px"></div><div class="k">🎧 이어폰 끼고 들어 보세요</div><h1>이 두 소리,<br><em>구분돼요?</em></h1><div class="sub">하나는 원본, 하나는 압축본</div>`],
  "rf1": [1080, 1920, `${top}<div style="height:330px"></div><div class="big">A</div>${wave(22, 1)}<div class="sub" style="text-align:center">▶ 재생 중</div>`],
  "rf2": [1080, 1920, `${top}<div style="height:330px"></div><div class="big">B</div>${wave(22, 4)}<div class="sub" style="text-align:center">▶ 재생 중</div>`],
  "rf3": [1080, 1920, `${top}<div style="height:260px"></div><div class="k">원본은 어느 쪽?</div><h1>A? B?<br><em>댓글로!</em></h1><div class="sub">10문제 다 풀면<br>내 귀 등급이 나와요 🏆</div><div class="cta">👉 프로필 링크</div><div class="note">nobangjang.com/ear-test</div>`],
};
const b = await chromium.launch(); const p = await b.newPage();
for (const [name, [w, h, inner, pad]] of Object.entries(frames)) {
  await p.setViewportSize({ width: w, height: h });
  fs.writeFileSync(`${S}${name}.html`, page(w, h, inner, pad));
  await p.goto(`file://${S}${name}.html`); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${S}${name}.png` });
}
await b.close();
