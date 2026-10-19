// 🐶 견주 · ⚽ K리그 팬 테스트 광고 릴스 (10/19). 사용: node render4.mjs <출력 폴더> [이름]
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
const D = { a: "#ffb357", bg: "#1a140e", room: "🐶 반려견 덕후방" };
const K = { a: "#5fd3ff", bg: "#0d1520", room: "⚽ K리그 덕후방" };
const sets = {
  "ad-dog": { ...D, reel: [
    `<div class="k">질문 4개 · 1분</div><h1>나는 어떤<br><em>견주</em>일까?</h1><div style="font-size:400px;margin-top:110px;text-align:center;position:relative">🐶</div>`,
    `<div class="k">5가지 견주 타입</div><div class="list"><div class="it">🔍 성분표 박사<span>사료 뒷면부터</span></div><div class="it">🧳 여행 메이트<span>어디든 같이</span></div><div class="it">🦮 산책왕<span>하루 두 번은 기본</span></div><div class="it">📸 전속 사진작가<span>갤러리 절반이 우리 개</span></div><div class="it">🏠 집콕 단짝<span>소파가 아지트</span></div></div>`,
    end("우리 개 자랑도<br><em>한 줄</em>", "결과 남기면 다른 견주들이 답글", "1분 테스트 →")] },
  "ad-kleague": { ...K, reel: [
    `<div class="k">질문 4개 · 1분</div><h1>나는 어떤<br><em>K리그 팬</em>일까?</h1><div style="font-size:400px;margin-top:110px;text-align:center;position:relative">⚽</div>`,
    `<div class="k">5가지 팬 타입</div><div class="list"><div class="it">🚌 원정 직관러<span>팀 가는 곳이면 어디든</span></div><div class="it">📣 직관 응원단<span>90분 응원가</span></div><div class="it">📊 전술 분석가<span>경기 후 복기까지</span></div><div class="it">👕 굿즈 수집가<span>옷장이 팀 컬러</span></div><div class="it">🛋 소파 응원단<span>거실이 경기장</span></div></div>`,
    end("우리 팀<br><em>응원하러 와요</em>", "K리그1·2 · 결과에 응원 팀 한 줄", "1분 테스트 →")] },
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const q = await b.newPage({ viewport: { width: 1080, height: 1350 } });
for (const [name, s] of Object.entries(sets)) {
  const h1 = s.reel[0].replace(/<div class="k">[^<]*<\/div>/, "");
  const list = s.reel[1].replace(/<div class="k">[^<]*<\/div>/, "");
  const f = `${S}/${name}-feed.html`; fs.writeFileSync(f, page(s.a, s.bg, 1080, 1350, s.room, `<div class="k" style="margin-top:70px">${(s.reel[0].match(/<div class="k">([^<]*)/)||[])[1]||""}</div>${h1.replace("<h1>", '<h1 style="font-size:84px;letter-spacing:-4px">').replace(/<br>/g," ")}${list.replace('class="list"','class="list" style="margin-top:44px;gap:14px"').replace(/class="it"/g,'class="it" style="font-size:38px;padding:20px 32px"')}`));
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
