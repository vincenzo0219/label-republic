// 📅 오늘의 문제 인스타 스토리 (10/15). 날짜별 첫 문장 문제만 (정답은 넣지 않는다).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import { DAILY_LINES, DAILY_START } from "../../src/lib/daily.ts";
const S = "/tmp/claude-0/-home-user-label-republic/2f542779-1470-5d32-894d-8d1bf43ecb77/scratchpad/daily/";
fs.mkdirSync(S, { recursive: true });
const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}*{box-sizing:border-box;margin:0}`;
const a = "#4fd1a5";
const page = (no, day, q) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${font}
body{width:1080px;height:1920px;font-family:P,"Noto Color Emoji",sans-serif;background:#121211;color:#f4f2ec;overflow:hidden;position:relative;padding:220px 90px}
body:before{content:"";position:absolute;right:-260px;top:-200px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,${a}40,transparent 65%)}
.k{font-size:46px;font-weight:700;color:${a};position:relative}.d{font-size:38px;color:#a9a59c;margin-top:10px;position:relative}
h1{font-size:96px;line-height:1.15;letter-spacing:-4px;margin-top:40px;position:relative}
.q{margin-top:70px;padding:50px 54px;border-left:10px solid ${a};background:#1d1d1b;border-radius:0 30px 30px 0;font-size:${q.line.length > 60 ? 50 : 62}px;line-height:1.55;font-weight:700;position:relative;word-break:keep-all}
.c{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:60px;position:relative}.c span{font-size:44px;font-weight:700;text-align:center;padding:30px 10px;border-radius:999px;border:3px solid #3a3a37;word-break:keep-all}
.cta{font-size:48px;font-weight:700;margin-top:80px;position:relative;color:${a}}.n{font-size:36px;color:#a9a59c;margin-top:16px;position:relative}
</style></head><body><div class="k">📅 노방장 오늘의 문제 #${no}</div><div class="d">${day.slice(5).replace("-", "/")} · 매일 0시 새 문제</div>
<h1>이 첫 문장,<br>무슨 책일까요?</h1><div class="q">${q.line.replace(/"/g, "&quot;")}</div>
<div class="c">${[q.answer, ...q.others].sort().map((t) => `<span>${t}</span>`).join("")}</div>
<div class="cta">👉 정답 확인 + 🎧 황금귀 한 문제</div><div class="n">nobangjang.com/daily</div></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
for (let n = 1; n < DAILY_LINES.length; n++) {
  const day = new Date(Date.parse(`${DAILY_START}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  fs.writeFileSync(`${S}d${n + 1}.html`, page(n + 1, day, DAILY_LINES[n]));
  await p.goto(`file://${S}d${n + 1}.html`); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${S}story-daily-${n + 1}.png` });
}
await b.close();
