import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const M = "/home/user/label-republic/public/marketing/";
const T = "/tmp/claude-0/-home-user-label-republic/2f542779-1470-5d32-894d-8d1bf43ecb77/scratchpad/";
const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}*{box-sizing:border-box;margin:0}`;
const a = "#f2b880";
const css = (w, h, pad) => `${font}
body{width:${w}px;height:${h}px;font-family:P,"Noto Color Emoji",sans-serif;background:#141311;color:#f4f2ec;overflow:hidden;position:relative;padding:${pad}}
body:before{content:"";position:absolute;right:-240px;top:-240px;width:800px;height:800px;border-radius:50%;background:radial-gradient(circle,${a}40,transparent 65%)}
.brand{font-size:32px;font-weight:700;position:relative}.k{margin-top:48px;font-size:36px;font-weight:700;color:${a};position:relative}
h1{font-size:88px;line-height:1.15;letter-spacing:-3px;margin-top:14px;position:relative}h1 em{font-style:normal;color:${a}}
.sub{font-size:34px;color:#c9c5bb;margin-top:24px;line-height:1.45;position:relative}
.q{margin-top:40px;background:#211f1c;border:2px solid #3a3631;border-radius:28px;padding:32px 34px;position:relative;font-size:34px;line-height:1.5}
.q b{color:${a}}.q .who{margin-top:14px;font-size:28px;color:#a9a59c}
.feat{margin-top:30px;display:grid;gap:12px;font-size:32px;position:relative}.feat b{color:${a}}
.cta{position:absolute;left:0;right:0;bottom:${pad.split(" ")[0]};text-align:center}
.cta span{display:inline-block;background:${a};color:#141311;font-weight:700;font-size:38px;border-radius:999px;padding:24px 44px}
.cta p{margin-top:20px;font-size:32px;color:#a9a59c}`;
const body = (extra) => `<div class="brand">🏠 노방장 · 📚 새 방</div>
<div class="k">방장 없이, 독자가 직접 연 첫 방</div>
<h1>읽는 책 제목을<br><em>교환해 보자</em></h1>
<div class="sub">단톡방처럼 밀려 사라지지 않고,<br>책 이야기가 책마다 쌓이는 곳</div>
<div class="q">"&lt;다정한 지옥&gt; 266/346쪽 읽는 중.<br>지금까지는 <b>「연화검, 혹은 흩날리는 티끌」</b>이 제일 좋았어요."<div class="who">— 첫 손님 목련처럼님</div></div>
${extra}
<div class="cta"><span>지금 읽는 책 제목, 하나만 남겨 주세요 📖</span><p>nobangjang.com/read · 가입 없음</p></div>`;
const feat = `<div class="feat"><div>📖 책 카드 — <b>완독률</b> · 다들 멈춘 지점 · 다음 책</div><div>📚 상황별 추천 — <b>"불안할 때" "선물할 때"</b> 읽을 책</div></div>`;
const b = await chromium.launch();
for (const [w, h, pad, name, extra] of [[1080, 1350, "72px 76px", "book-room-1080x1350.png", ""], [1080, 1920, "150px 76px", "story-book-room-1080x1920.png", feat]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const f = T + name + ".html";
  fs.writeFileSync(f, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css(w, h, pad)}</style></head><body>${body(extra)}</body></html>`);
  await p.goto("file://" + f); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: M + name }); await p.close();
}
await b.close();
