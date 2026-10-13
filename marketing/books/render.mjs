import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const M = "/home/user/label-republic/public/marketing/";
const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}*{box-sizing:border-box;margin:0}`;
const a = "#4fd1a5";
const css = (w, h, pad) => `${font}
body{width:${w}px;height:${h}px;font-family:P,"Noto Color Emoji",sans-serif;background:#121211;color:#f4f2ec;overflow:hidden;position:relative;padding:${pad}}
body:before{content:"";position:absolute;right:-220px;top:-220px;width:780px;height:780px;border-radius:50%;background:radial-gradient(circle,${a}44,transparent 65%)}
.brand{font-size:32px;font-weight:700;position:relative}.k{margin-top:50px;font-size:36px;font-weight:700;color:${a};position:relative}
h1{font-size:96px;line-height:1.12;letter-spacing:-4px;margin-top:14px;position:relative}h1 em{font-style:normal;color:${a}}
.sub{font-size:36px;color:#c9c5bb;margin-top:26px;line-height:1.4;position:relative}
.card{margin-top:46px;background:#1f1f1d;border:2px solid #34342f;border-radius:32px;padding:36px;position:relative}
.btns{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.btns span{border:3px solid #3a3a35;border-radius:20px;padding:22px 0;text-align:center;font-size:34px;font-weight:700}
.btns span.on{border-color:${a};background:${a}22}
.out{margin-top:30px;display:grid;gap:14px;font-size:34px}.out b{color:${a}}
.cta{position:absolute;left:0;right:0;bottom:${pad.split(" ")[0]};text-align:center}
.cta span{display:inline-block;background:${a};color:#121211;font-weight:700;font-size:38px;border-radius:999px;padding:24px 44px}
.first{margin-top:60px;position:relative;font-size:36px;line-height:1.6;color:#c9c5bb}.first b{color:#f4f2ec}
.cta p{margin-top:22px;font-size:32px;color:#a9a59c}`;
const body = `<div class="brand">🏠 노방장 · 📖 책 카드</div>
<div class="k">스레드에선 하루면 밀려 사라지는 책 이야기</div>
<h1>이 책, <em>끝까지</em><br>읽을 만해요?</h1>
<div class="sub">읽은 사람들의 진짜 기록으로 답해요.<br>책마다 한 장씩, 계속 쌓여요.</div>
<div class="card"><div class="btns"><span>📖 읽는 중</span><span class="on">✅ 완독</span><span>🏳️ 중도 포기</span></div>
<div class="out"><div>→ 기록이 모이면 <b>완독률</b></div><div>→ 포기한 사람들이 <b>멈춘 지점</b></div><div>→ 이 책 다음에 <b>뭘 읽었는지</b></div></div></div>
<div class="cta"><span>지금 읽는 책, 한 번만 눌러 주세요 👆</span><p>nobangjang.com/books · 가입 없음</p></div>`;
const b = await chromium.launch();
const first = `<div class="first">📚 첫 카드가 열렸어요<br><b>『미움받을 용기』 · 『다정한 지옥』</b><br>당신이 읽는 책도 한 장 만들어 주세요</div>`;
for (const [w, h, pad, name, extra] of [[1080, 1350, "72px 76px", "books-card-1080x1350.png", ""], [1080, 1920, "150px 76px", "story-books-1080x1920.png", first]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const f = `/tmp/claude-0/-home-user-label-republic/2f542779-1470-5d32-894d-8d1bf43ecb77/scratchpad/${name}.html`;
  fs.writeFileSync(f, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css(w, h, pad)}</style></head><body>${body.replace('</div></div>\n<div class="cta">', '</div></div>' + extra + '\n<div class="cta">')}</body></html>`);
  await p.goto("file://" + f);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: M + name });
  await p.close();
}
await b.close();
