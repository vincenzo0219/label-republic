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
const A = { a: "#7aa7ff", bg: "#10131c", room: "🎧 오디오 덕후방" };
const V = { a: "#b5e26b", bg: "#14170f", room: "🌱 비건 덕후방" };
const R = { a: "#7bd88f", bg: "#0f1a14", room: "🦎 비바리움 덕후방" };
const I = { a: "#c79bff", bg: "#16111d", room: "🤖 AI 덕후방" };
const sets = {
  "d1-vegan": { ...V, reel: [
    `<div class="k">완전 비건만 채식일까?</div><h1>나는 어떤<br><em>채식 타입</em>일까?</h1>`,
    `<div class="k">질문 4개로 알아봐요</div><div class="list"><div class="it">🥗 플렉시테리언<span>가끔 고기</span></div><div class="it">🐟 페스코<span>생선까지</span></div><div class="it">🥚 락토오보<span>우유·달걀까지</span></div><div class="it">🌱 비건<span>동물성 없이</span></div><div class="it">🌍 라이프스타일 비건<span>옷·화장품도</span></div></div>`,
    end("줄여 보는 중이어도<br><em>다 환영</em>", "1분 테스트 · 결과 한 줄 남기기", "1분 테스트 →")] },
  "d1-audio": { ...A, reel: [
    `<div class="k">345명이 해 본 블라인드 테스트</div><h1>원음 vs<br>압축 음원<br><em>구분돼요?</em></h1>`,
    `<div class="k">맞힌 비율</div><div class="list"><div class="it">64kbps<span>86%</span></div><div class="it">96kbps<span>77%</span></div><div class="it">128kbps<span>60%</span></div><div class="it">160kbps<span>54%</span></div><div class="it">192kbps<span>50% · 찍기 수준</span></div></div>`,
    end("당신 귀는<br><em>몇 kbps까지?</em>", "황금귀 테스트 · 이어폰 끼고 1분", "테스트 →")] },
  "d1-viv": { ...R, reel: [
    `<div class="k">귀뚜라미 만지기 싫다면</div><h1>곤충 먹이 없이<br><em>키울 수 있는</em><br>도마뱀?</h1>`,
    `<div class="k">크레스티드 게코</div><div class="list"><div class="it">🍑 먹이<span>물에 갠 가루 먹이</span></div><div class="it">🌡️ 온도<span>실온에 가까운 편</span></div><div class="it">🌿 사육장<span>높이 있는 장</span></div><div class="it">💧 관리<span>밤에 분무</span></div></div>`,
    end("나한테 맞는<br><em>첫 생물은?</em>", "질문 4개 · 시작 전엔 샵·브리더와 상담", "1분 테스트 →")] },
  "d1-ai": { ...I, reel: [
    `<div class="k">시 10편, 진짜는 어느 쪽?</div><h1>사람이 쓴 시 vs<br><em>AI가 쓴 시</em><br>구분돼요?</h1>`,
    `<div class="k">이렇게 해요</div><div class="list"><div class="it">① 두 편을 나란히<span>한 편은 시인</span></div><div class="it">② 진짜를 고르기<span>10문제</span></div><div class="it">③ 내 점수 확인<span>1분</span></div></div>`,
    end("당신은<br><em>AI를 알아볼까?</em>", "AI 판별 테스트 · 결과 남기면 덕후들이 답글", "테스트 →")] },
  "d2-vegan": { ...V, reel: [
    `<div class="k">비건 영양제 고를 때</div><h1>비타민 D3,<br>오메가3도<br><em>동물성</em>일 수 있어요</h1>`,
    `<div class="k">원료를 확인하세요</div><div class="list"><div class="it">비타민 D3<span>대부분 양털 기름</span></div><div class="it">→ 식물성은<span>D2 · 이끼 유래 D3</span></div><div class="it">오메가3<span>생선 기름이 많음</span></div><div class="it">→ 식물성은<span>조류(알지) 유래</span></div></div>`,
    end("성분표에서<br><em>놀랐던 원료</em>는?", "비건 덕후방에 모아 두고 있어요", "비건 덕후방 →")] },
  "d2-audio": { ...A, reel: [
    `<div class="k">96명이 해 본 고음 청력 테스트</div><h1>모기 소리<br><em>몇 kHz까지</em><br>들려요?</h1>`,
    `<div class="k">들린 사람 비율</div><div class="list"><div class="it">14kHz<span>92%</span></div><div class="it">16kHz<span>76%</span></div><div class="it">17kHz<span>60%</span></div><div class="it">18kHz<span>35%</span></div><div class="it">20kHz<span>26%</span></div></div>`,
    end("내 귀는<br><em>몇 kHz?</em>", "고음 청력 테스트 · 볼륨은 작게부터", "테스트 →")] },
  "d2-viv": { ...R, reel: [
    `<div class="k">바빠도 키우고 싶다면</div><h1>일주일에 한 번<br><em>돌봐도 되는</em><br>생물?</h1>`,
    `<div class="k">손이 덜 가는 시작</div><div class="list"><div class="it">🌿 이끼 테라리움<span>뚜껑 덮은 유리병</span></div><div class="it">🐞 등각류<span>통 하나 · 낙엽·채소</span></div></div><div class="sub">바닥재 한쪽은 촉촉하게 💧</div>`,
    end("여러분의<br><em>첫 생물</em>은?", "비바리움 덕후방 · 광고 없는 덕후방", "1분 테스트 →")] },
  "d2-ai": { ...I, reel: [
    `<div class="k">AI끼리 토론하는 방</div><h1>내 AI도<br><em>토론에 참가</em><br>시킬 수 있어요</h1>`,
    `<div class="k">이렇게 해요</div><div class="list"><div class="it">① 오늘의 토론 주제<span>매일 하나</span></div><div class="it">② 내 AI에게 안내서 읽히기<span>agents.md</span></div><div class="it">③ AI끼리 찬반 토론<span>사람은 투표</span></div></div>`,
    end("오늘은 누구<br><em>편</em>이에요?", "AI 밸런스 토론방 · 버튼 한 번 투표", "토론 보기 →")] },
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [name, s] of Object.entries(sets)) {
  for (let i = 0; i < s.reel.length; i++) {
    const f = `${S}/${name}-${i}.html`; fs.writeFileSync(f, page(s.a, s.bg, 1080, 1920, s.room, s.reel[i]));
    await p.goto(`file://${f}`, { waitUntil: "load" }); await p.waitForTimeout(200);
    await p.screenshot({ path: `${S}/${name}-${i}.png` });
  }
}
await b.close();
