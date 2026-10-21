// 10/22~24 KBO·애니 광고 이미지 (render7 복사). 사용: node render8.mjs <출력 폴더>
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const S = process.argv[2];
const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}*{box-sizing:border-box;margin:0}`;
const css = (a, bg, w, h) => `${font}
body{width:${w}px;height:${h}px;font-family:P,"Noto Color Emoji",sans-serif;background:${bg};color:#f4f2ec;overflow:hidden;position:relative;padding:${h > 1500 ? 150 : 90}px 84px}
body:before{content:"";position:absolute;right:-260px;top:-160px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,${a}55,transparent 65%)}
body:after{content:"";position:absolute;left:-300px;bottom:-300px;width:800px;height:800px;border-radius:50%;background:radial-gradient(circle,${a}22,transparent 65%)}
.top{display:flex;justify-content:space-between;align-items:center;position:relative}
.brand{font-size:40px;font-weight:700;display:flex;align-items:center;gap:14px}.brand i{font-style:normal;background:#1f5f4a;border-radius:14px;padding:6px 12px;font-size:32px}
.room{font-size:32px;font-weight:700;color:${a};border:2px solid ${a}88;border-radius:999px;padding:12px 26px}
.k{margin-top:${h > 1500 ? 230 : 110}px;font-size:44px;font-weight:700;color:${a};position:relative}
h1{font-size:${h > 1500 ? 124 : 104}px;line-height:1.12;font-weight:700;letter-spacing:-5px;margin-top:28px;position:relative}
h1 em,.big em{font-style:normal;color:${a}}
.list{display:grid;gap:22px;margin-top:70px;position:relative}
.it{font-size:46px;font-weight:700;background:#ffffff10;border:3px solid #ffffff22;border-radius:30px;padding:28px 38px;display:flex;justify-content:space-between;gap:20px}
.it span{color:#c9c5bb;font-weight:400;font-size:38px;align-self:center}
.big{margin-top:${h > 1500 ? 300 : 150}px;font-size:${h > 1500 ? 116 : 96}px;line-height:1.15;font-weight:700;letter-spacing:-5px;position:relative}
.sub{margin-top:46px;font-size:48px;line-height:1.5;color:#c9c5bb;position:relative}
.foot{position:absolute;left:84px;right:84px;bottom:${h > 1500 ? 220 : 90}px;display:flex;justify-content:space-between;align-items:center}
.cta{font-size:46px;font-weight:700;background:${a};color:#121211;border-radius:999px;padding:26px 50px}
.note{font-size:30px;color:#a9a59c;text-align:right;line-height:1.45}`;
const page = (a, bg, w, h, room, inner) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css(a, bg, w, h)}</style></head><body><div class="top"><div class="brand"><i>🏠</i>노방장</div><div class="room">${room}</div></div>${inner}</body></html>`;
const foot = (t) => `<div class="foot"><span class="cta">${t}</span><span class="note">가입 없이 닉네임만<br>방장 없는 덕후 커뮤니티</span></div>`;
const end = (big, sub, cta) => `<div class="big">${big}</div><div class="sub">${sub}<br>👉 프로필 링크</div>${foot(cta)}`;
const KB = { a: "#ff6b5f", bg: "#1a0f10", room: "⚾ KBO 덕후방" };
const AN = { a: "#c79bff", bg: "#140f1d", room: "🎨 애니·만화 덕후방" };
// 10/22~24 광고용 (확인된 사실만: 이투데이 10/20 플레이오프 대진, AGF 공식·게임메카 일정)
const sets = {
  "ad-kbo": { ...KB, reel: [
    `<div class="k">가을야구 플레이오프</div><h1>삼성 vs KIA<br><em>누가 이겨요?</em></h1>`,
    `<div class="k">10/25(일) 대구 1차전</div><div class="list"><div class="it">⚾ 5전 3선승제<span>플레이오프</span></div><div class="it">🔥 KIA 준PO<span>3승 0패</span></div><div class="it">🏟 1차전<span>10/25(일) 대구</span></div></div>`,
    end("응원 팀<br><em>한 줄 남기기</em>", "직관 가는 사람끼리 모여요", "KBO 덕후방 →")] },
  "ad-anime": { ...AN, reel: [
    `<div class="k">AGF 2026 · 킨텍스</div><h1>12월 AGF<br><em>같이 갈 사람?</em></h1>`,
    `<div class="k">Anime x Game Festival</div><div class="list"><div class="it">📅 12/4(금)~12/6(일)<span>3일</span></div><div class="it">📍 킨텍스 제1전시장<span>1~5홀</span></div><div class="it">🎟 일반 티켓<span>11/12 오픈</span></div></div>`,
    end("요즘 보는 작품<br><em>한 줄 남기기</em>", "코믹월드·팝업 소식도 모아요", "애니 덕후방 →")] },
};
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const q = await b.newPage({ viewport: { width: 1080, height: 1350 } });
for (const [name, s] of Object.entries(sets)) {
  const h1 = s.reel[0].replace(/<div class="k">[^<]*<\/div>/, "");
  const list = s.reel[1].replace(/<div class="k">[^<]*<\/div>/, "");
  const f = `${S}/${name}-feed.html`; fs.writeFileSync(f, page(s.a, s.bg, 1080, 1350, s.room, `<div class="k" style="margin-top:70px">${(s.reel[0].match(/<div class="k">([^<]*)/)||[])[1]||""}</div>${h1.replace("<h1>", '<h1 style="font-size:84px;letter-spacing:-4px">').replace(/<br>/g," ")}${list.replace('class="list"','class="list" style="margin-top:44px;gap:14px"').replace(/class="it"/g,'class="it" style="font-size:38px;padding:20px 32px"')}${s.reel[2].replace('class="big"','class="big" style="margin-top:70px;font-size:76px;letter-spacing:-3px"').replace('class="sub"','class="sub" style="margin-top:18px;font-size:38px"').replace("<br>👉 프로필 링크","")}`));
  await q.goto(`file://${f}`, { waitUntil: "load" }); await q.waitForTimeout(200);
  await q.screenshot({ path: `${S}/${name}-feed.png` });
}
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [name, s] of Object.entries(sets).filter(([n]) => !process.argv[3] || n === process.argv[3])) {
  for (let i = 0; i < s.reel.length; i++) {
    const f = `${S}/${name}-${i}.html`; fs.writeFileSync(f, page(s.a, s.bg, 1080, 1920, s.room, s.reel[i]));
    await p.goto(`file://${f}`, { waitUntil: "load" }); await p.waitForTimeout(200);
    await p.screenshot({ path: `${S}/${name}-${i}.png` });
  }
}
await b.close();
