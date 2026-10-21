// 10/21 방별 릴스·이미지 (견주 산책·K리그 직관·LP·두부). 사용: node render5.mjs <출력 폴더>
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
const R = { a: "#7bd88f", bg: "#0f1a14", room: "🦎 비바리움 덕후방" };
const B = { a: "#f2c46d", bg: "#17130c", room: "📚 책 덕후방" };
// 10/22 — 실제 데이터: /rank/fan (10/20까지 48개), /api/first-line-test (58명, 평균 5.6, 8번 17%)
const sets = {
  "d4-kl": { ...K, reel: [
    `<div class="k">48명이 남긴 결과</div><h1>K리그 팬 순위<br><em>첫 공개</em></h1>`,
    `<div class="k">팬 테스트 · 응원 팀</div><div class="list"><div class="it">🥇 수원삼성<span>10명</span></div><div class="it">🥈 전북<span>6명</span></div><div class="it">🥉 안양 · 울산<span>4명</span></div><div class="it">🚌 원정 직관러<span>가장 많은 타입</span></div></div>`,
    end("우리 팀<br><em>몇 위?</em>", "1분 테스트 · 매일 아침 순위 업데이트", "순위 올리기 →")] },
  "d4-book": { ...B, reel: [
    `<div class="k">첫 문장만 보고</div><h1>무슨 책인지<br><em>맞힐 수 있어요?</em></h1>`,
    `<div class="k">58명이 풀어 본 결과</div><div class="list"><div class="it">📖 10문제 평균<span>5.6개</span></div><div class="it">🔥 가장 쉬운 문제<span>79% 정답</span></div><div class="it">😵 가장 어려운 문제<span>17% 정답</span></div></div>`,
    end("당신은<br><em>몇 개?</em>", "친구랑 내기해 보세요 · 1분", "테스트 →")] },
  "d4-viv": { ...R, reel: [
    `<div class="k">손 많이 가서 좋은 취미</div><h1>자동 미스팅?<br><em>손 분무?</em></h1>`,
    `<div class="k">비바리움 덕후방 질문</div><div class="list"><div class="it">💧 자동 미스팅<span>vs 손 분무</span></div><div class="it">🌿 이끼<span>vs 다육</span></div><div class="it">🐞 등각류<span>vs 톡토기</span></div><div class="it">🫙 유리장<span>vs 아크릴</span></div></div>`,
    end("우리 장은<br><em>어느 쪽?</em>", "사진 한 장 자랑도 환영 📷", "덕후방 →")] },
  "d4-dog": { ...D, reel: [
    `<div class="k">견주들 은근 갈리는 질문</div><h1>침대에서<br><em>같이 자요?</em></h1>`,
    `<div class="k">반려견 덕후방 오늘의 질문</div><div class="list"><div class="it">🛏 같이 잔다<span>vs 각자 잔다</span></div><div class="it">🦮 하네스<span>vs 목줄</span></div><div class="it">🎾 공놀이<span>vs 노즈워크</span></div><div class="it">🦴 간식 수제<span>vs 사서</span></div></div>`,
    end("우리 집은<br><em>어느 쪽?</em>", "댓글로 알려 주세요 · 사진도 환영", "투표하러 →")] },
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
