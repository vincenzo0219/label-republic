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
const sets = {
  viv: { a: "#7bd88f", bg: "#0f1a14", room: "🦎 비바리움 덕후방",
    reel: [
      `<div class="k">원룸·책상 위도 가능?</div><h1>우리 집에서<br><em>키울 수 있는</em><br>생물은?</h1>`,
      `<div class="k">질문 4개면 나와요</div><div class="list"><div class="it">🌿 이끼 테라리움<span>물 주기 가끔</span></div><div class="it">🐞 등각류<span>통 하나로 시작</span></div><div class="it">🦎 크레스티드 게코<span>곤충 없이도</span></div><div class="it">🦎 레오파드 게코<span>손에 올려 보기</span></div><div class="it">🐸 다트프록<span>보는 재미</span></div></div>`,
      `<div class="big">당신은<br><em>어떤 생물?</em></div><div class="sub">1분 테스트 · 결과 남기면<br>덕후들이 답글 달아 줘요<br>👉 프로필 링크</div>${foot("1분 테스트 →")}`,
    ],
    feed: `<div class="k">🦎 1분 테스트</div><h1>우리 집에서<br><em>키울 수 있을까?</em></h1><div class="sub">자리 · 시간 · 먹이 · 손에 올리기<br>질문 4개로 나에게 맞는 첫 생물</div>${foot("프로필 링크 →")}` },
  vegan: { a: "#b5e26b", bg: "#14170f", room: "🌱 비건 덕후방",
    reel: [
      `<div class="k">성분표 읽어 보셨어요?</div><h1>이 이름,<br><em>동물성</em>인 거<br>알았어요?</h1>`,
      `<div class="k">이름만 보면 모르는 원료</div><div class="list"><div class="it">젤라틴<span>소·돼지 뼈·가죽</span></div><div class="it">카민(코치닐)<span>연지벌레 색소</span></div><div class="it">셸락<span>깍지벌레 코팅</span></div><div class="it">유청·카제인<span>우유</span></div><div class="it">비타민 D3<span>대부분 양털 기름</span></div></div>`,
      `<div class="big">나는 어떤<br><em>채식 타입?</em></div><div class="sub">플렉시 · 페스코 · 락토오보 · 비건<br>질문 4개, 1분이면 나와요<br>👉 프로필 링크</div>${foot("1분 테스트 →")}`,
    ],
    feed: `<div class="k">🌱 성분표 꿀팁</div><h1>이 이름 보이면<br><em>동물성</em>일 수 있어요</h1><div class="list"><div class="it">젤라틴<span>소·돼지</span></div><div class="it">카민 · 셸락<span>곤충</span></div><div class="it">유청 · 카제인<span>우유</span></div></div>${foot("전체 목록 →")}` },
};
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, s] of Object.entries(sets)) {
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (let i = 0; i < s.reel.length; i++) {
    const f = `${S}/${name}-reel-${i}.html`; fs.writeFileSync(f, page(s.a, s.bg, 1080, 1920, s.room, s.reel[i]));
    await p.goto(`file://${f}`, { waitUntil: "load" }); await p.waitForTimeout(200);
    await p.screenshot({ path: `${S}/${name}-reel-${i}.png` });
  }
  const q = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  const f = `${S}/${name}-feed.html`; fs.writeFileSync(f, page(s.a, s.bg, 1080, 1350, s.room, s.feed));
  await q.goto(`file://${f}`, { waitUntil: "load" }); await q.waitForTimeout(200);
  await q.screenshot({ path: `${S}/${name}-feed-1080x1350.png` });
}
await b.close();
