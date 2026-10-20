// 광고 릴스 2차 (10/20): 반려견·비바리움·책방 — 방 기능 + 행사 정보. 사용: node render6.mjs <출력 폴더>
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
const R = { a: "#7bd88f", bg: "#0f1a14", room: "🦎 비바리움 덕후방" };
const B = { a: "#f0c674", bg: "#17140f", room: "📚 책방" };
const big = (e) => `<div style="font-size:380px;margin-top:100px;text-align:center;position:relative">${e}</div>`;
const ev = (k, items, cta) => `<div class="k">${k}</div><div class="list">${items.map(([t, d]) => `<div class="it">${t}<span>${d}</span></div>`).join("")}</div>${foot(cta)}`;
const sets = {
  "ad2-dog": { ...D, reel: [
    `<div class="k">견주들이 모이는 곳</div><h1>강아지랑<br>이번 주말<br><em>어디 가지?</em></h1>${big("🐶")}`,
    `<div class="k">반려견 덕후방에서 할 수 있는 것</div><div class="list"><div class="it">🎫 반려견 행사 정보<span>매일 업데이트</span></div><div class="it">🐶 1분 견주 테스트<span>나는 어떤 견주?</span></div><div class="it">🗳 오늘의 질문<span>버튼 한 번</span></div><div class="it">📷 우리 개 사진 자랑<span>댓글에 바로</span></div><div class="it">💬 견주 수다방<span>카톡처럼</span></div></div>`,
    ev("🎫 이번 주 반려견 행사", [["서울펫림픽", "10/24~25 상암"], ["이천펫축제", "10/24~25 예스파크"], ["마이펫페어 광교", "10/23~25 수원"], ["서울 댕냥데이즈", "10/31 마포"]], "행사 보러 가기 →")] },
  "ad2-viv": { ...R, reel: [
    `<div class="k">도마뱀·개구리·이끼 덕후</div><h1>비바리움 덕후<br><em>모이는 곳</em></h1>${big("🦎")}`,
    `<div class="k">비바리움 덕후방에서 할 수 있는 것</div><div class="list"><div class="it">🎫 파충류 박람회 소식<span>날짜·장소 정리</span></div><div class="it">🦎 1분 첫 생물 테스트<span>나한테 맞는 생물?</span></div><div class="it">🗳 오늘의 질문<span>게코 vs 개구리</span></div><div class="it">📷 우리 장 사진 자랑<span>댓글에 바로</span></div><div class="it">💬 수다방<span>입문자도 환영</span></div></div>`,
    end("박람회 소식,<br><em>여기서 먼저</em>", "가입 없이 닉네임만 · 행사 제보도 환영", "덕후방 가기 →")] },
  "ad2-book": { ...R, ...B, reel: [
    `<div class="k">책 좋아하는 사람들</div><h1>요즘<br><em>무슨 책</em><br>읽어요?</h1>${big("📚")}`,
    `<div class="k">책방에서 할 수 있는 것</div><div class="list"><div class="it">🎫 북페어·작가 행사<span>모아서 정리</span></div><div class="it">📖 첫 문장 테스트<span>첫 줄로 책 맞히기</span></div><div class="it">📚 오늘의 책 질문<span>버튼 한 번</span></div><div class="it">✍️ 지금 읽는 책 한 줄<span>남기고 구경</span></div><div class="it">💬 책 수다방<span>추천 주고받기</span></div></div>`,
    ev("🎫 다가오는 책 행사", [["서울아트북페어", "11/6~8 북서울미술관"], ["서울형 작가힙톡", "매주 금 · 서울 도서관"]], "책방 가기 →")] },
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
