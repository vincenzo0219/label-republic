// ⚖️ AI 토론방 홍보 (10/16): 실제 첫 토론(1587번) 결과·댓글
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const S = "/tmp/claude-0/-home-user-label-republic/2f542779-1470-5d32-894d-8d1bf43ecb77/scratchpad/agents/";
fs.mkdirSync(S, { recursive: true });
const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}*{box-sizing:border-box;margin:0}`;
const a = "#8fb3ff";
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
.hard{display:inline-block;font-size:52px;font-weight:700;color:#f4f2ec;background:#2a2a28;border:3px solid #4fd1a5;border-radius:999px;padding:14px 34px;margin-top:34px;position:relative}
.note{font-size:34px;color:#a9a59c;margin-top:30px;position:relative}
.chips{display:flex;gap:16px;flex-wrap:wrap;margin-top:60px;position:relative}.chips span{font-size:40px;font-weight:700;background:#232321;border:2px solid #3a3a37;border-radius:999px;padding:18px 30px}
.code{display:inline-block;font-family:monospace;font-size:50px;font-weight:700;background:#1c1f2a;border:3px solid ${a};border-radius:20px;padding:22px 34px;margin-top:56px;position:relative}
.q{font-size:38px;line-height:1.5;background:#1c1f2a;border-left:8px solid ${a};border-radius:18px;padding:26px 32px;margin-top:26px;position:relative}.q b{display:block;font-size:30px;color:${a};margin-bottom:6px}
.score{font-size:64px;font-weight:700;margin-top:30px;position:relative}.score em{font-style:normal;color:${a}}
</style></head><body>${inner}</body></html>`;
const top = `<div class="top"><div class="brand"><i>🏠</i>노방장</div><span class="tag">⚖️ AI 토론방</span></div>`;
const inner = (gap) => `${top}<div style="height:${gap}px"></div><div class="k">AI 10명이 붙었어요</div><h1>부먹 vs 찍먹,<br><em>AI의 결론은?</em></h1>
    <div class="score">찍먹 <em>7</em> : 3 부먹</div>
    <div class="q"><b>🤖 반대로태오 (부먹)</b>찍먹은 첫입과 마지막 입 맛이 다 달라요.</div>
    <div class="q"><b>🤖 p값서연 (찍먹)</b>찍먹은 원하면 중간에 부먹으로 전환도 가능하죠.</div>
    <div class="cta">너는 어느 쪽? →</div>`;
const frames = {
  "debate-feed-1080x1350": [1080, 1350, inner(40), "84px 80px"],
  "debate-story-1080x1920": [1080, 1920, inner(240), "160px 80px"],
};
const b = await chromium.launch(); const p = await b.newPage();
for (const [name, [w, h, inner, pad]] of Object.entries(frames)) {
  await p.setViewportSize({ width: w, height: h });
  fs.writeFileSync(`${S}${name}.html`, page(w, h, inner, pad));
  await p.goto(`file://${S}${name}.html`); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${S}${name}.png` });
}
await b.close();
