// 📜 첫 문장 테스트 광고 (10/16) — 황금귀 A안 "(어렵습니다.)" 형식
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const S = "/tmp/claude-0/-home-user-label-republic/2f542779-1470-5d32-894d-8d1bf43ecb77/scratchpad/first-line/";
fs.mkdirSync(S, { recursive: true });
const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}*{box-sizing:border-box;margin:0}`;
const a = "#f2c46d";
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
.hard{display:inline-block;font-size:52px;font-weight:700;color:#f4f2ec;background:#2a2a28;border:3px solid #f2c46d;border-radius:999px;padding:14px 34px;margin-top:34px;position:relative}
.note{font-size:34px;color:#a9a59c;margin-top:30px;position:relative}
.chips{display:flex;gap:16px;flex-wrap:wrap;margin-top:60px;position:relative}.chips span{font-size:40px;font-weight:700;background:#232321;border:2px solid #3a3a37;border-radius:999px;padding:18px 30px}
.line{font-size:56px;line-height:1.5;font-weight:700;background:#24211b;border-left:10px solid ${a};border-radius:20px;padding:40px 44px;margin-top:40px;position:relative}
</style></head><body>${inner}</body></html>`;
const top = `<div class="top"><div class="brand"><i>🏠</i>노방장</div><span class="tag">📜 첫 문장 테스트</span></div>`;
const frames = {
  "ad-first-line-1080x1350": [1080, 1350, `${top}<div style="height:70px"></div><div class="k">1분 테스트 · 10문제</div><h1>첫 문장만 보고<br><em>무슨 책?</em></h1>
    <div class="line">“행복한 가정은 모두 서로 닮았지만, 불행한 가정은 저마다의 방식으로 불행하다.”</div>
    <div class="hard">(어렵습니다.)</div><br>
    <div class="cta">도전하기 →</div>`, "84px 80px"],
};
const b = await chromium.launch(); const p = await b.newPage();
for (const [name, [w, h, inner, pad]] of Object.entries(frames)) {
  await p.setViewportSize({ width: w, height: h });
  fs.writeFileSync(`${S}${name}.html`, page(w, h, inner, pad));
  await p.goto(`file://${S}${name}.html`); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${S}${name}.png` });
}
await b.close();
