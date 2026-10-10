import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const S = process.argv[2];
const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}*{box-sizing:border-box;margin:0}`;
const page = (a, inner) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${font}
body{width:1080px;height:1920px;font-family:P,"Noto Color Emoji",sans-serif;background:#121211;color:#f4f2ec;overflow:hidden;position:relative;padding:150px 84px}
body:before{content:"";position:absolute;right:-260px;top:-160px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,${a}44,transparent 65%)}
body:after{content:"";position:absolute;left:-300px;bottom:-300px;width:800px;height:800px;border-radius:50%;background:radial-gradient(circle,${a}22,transparent 65%)}
.top{display:flex;justify-content:space-between;align-items:center;position:relative}
.brand{font-size:40px;font-weight:700;display:flex;align-items:center;gap:14px}.brand i{font-style:normal;background:#1f5f4a;border-radius:14px;padding:6px 12px;font-size:32px}
.room{font-size:32px;font-weight:700;color:${a};border:2px solid ${a}88;border-radius:999px;padding:12px 26px}
.k{margin-top:230px;font-size:44px;font-weight:700;color:${a};position:relative}
h1{font-size:132px;line-height:1.1;font-weight:700;letter-spacing:-6px;margin-top:28px;position:relative}
h1 em{font-style:normal;color:${a}}
.opts{display:grid;gap:26px;margin-top:90px;position:relative}
.opt{font-size:54px;font-weight:700;background:#232321;border:3px solid #3a3a37;border-radius:36px;padding:34px 44px}
.big{margin-top:300px;font-size:120px;line-height:1.15;font-weight:700;letter-spacing:-5px;position:relative}
.big em{font-style:normal;color:${a}}
.sub{margin-top:50px;font-size:50px;line-height:1.5;color:#c9c5bb;position:relative}
.foot{position:absolute;left:84px;right:84px;bottom:220px;display:flex;justify-content:space-between;align-items:center}
.cta{font-size:48px;font-weight:700;background:${a};color:#121211;border-radius:999px;padding:28px 52px}
.note{font-size:32px;color:#a9a59c;text-align:right;line-height:1.45}
</style></head><body><div class="top"><div class="brand"><i>🏠</i>노방장</div><div class="room">🎧 오디오 덕후들</div></div>${inner}</body></html>`;
const foot = `<div class="foot"><span class="cta">댓글로 답하기 →</span><span class="note">가입 없이 닉네임만<br>방장 없는 덕후 커뮤니티</span></div>`;
const reels = [
  ["reel-codec", "#b98cff", "SBC · AAC · aptX · LDAC", "코덱 바꾸면<br><em>진짜 들려요?</em>", ["🎧 확실히 들림", "🤷 기분 탓", "🔌 그래서 유선"]],
  ["reel-price", "#7aa7ff", "블라인드 테스트", "10만 원 vs<br>30만 원 이어폰<br><em>눈 감고 구분?</em>", ["🙆 당연히 구분", "🙅 솔직히 몰라", "💸 번들로 충분"]],
  ["reel-wired", "#4fd1a5", "덕후들 사이에서도 갈리는 중", "유선 vs 무선<br><em>지금 뭐 써요?</em>", ["🔌 유선 (음질)", "📶 무선 (편함)", "🔁 둘 다 (출퇴근 무선, 집 유선)"]],
];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [name, a, k, h1, opts] of reels) {
  const frames = [
    `<div class="k">${k}</div><h1>${h1}</h1>`,
    `<div class="k">${k}</div><h1>${h1}</h1><div class="opts">${opts.map((o) => `<div class="opt">${o}</div>`).join("")}</div>`,
    `<div class="big">당신은<br><em>어느 쪽?</em></div><div class="sub">덕후들이 지금 토론 중이에요.<br>👉 프로필 링크에서 댓글로 답해 주세요</div>${foot}`,
  ];
  for (let i = 0; i < frames.length; i++) {
    const f = `${S}/reels/${name}-${i}.html`; fs.writeFileSync(f, page(a, frames[i]));
    await p.goto(`file://${f}`, { waitUntil: "load" }); await p.waitForTimeout(150);
    await p.screenshot({ path: `${S}/reels/${name}-${i}.png` });
  }
}
await b.close();
