// 10/21 SNS 디자인 틀 6가지 — 피드가 같은 어두운 카드로 도배돼 보인다는 운영자 피드백.
// 하루 안에 같은 틀을 두 번 쓰지 말고, 바로 앞 게시물과 다른 틀을 고른다 (render9.mjs 가 순서대로 돌린다).
// 각 틀: (s, w, h, frame) → <body> 안쪽 HTML + 틀 전용 CSS. frame: "feed" | 0(질문) | 1(목록) | 2(행동)
// s = { room, emoji, accent, kicker, title, em, items:[[왼쪽, 오른쪽]], big, sub, cta }

const font = `@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Regular.woff);font-weight:400}
@font-face{font-family:P;src:url(file:///home/user/label-republic/assets/fonts/Pretendard-Bold.woff);font-weight:700}
*{box-sizing:border-box;margin:0;word-break:keep-all}body{font-family:P,"Noto Color Emoji",sans-serif;overflow:hidden;position:relative}`;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
// 제목에서 em 부분만 강조
const titleHtml = (s, tag = "em") => (s.em && s.title.includes(s.em) ? esc(s.title).replace(esc(s.em), `<${tag}>${esc(s.em)}</${tag}>`) : esc(s.title));
const brand = `<span class="brand">🏠 노방장</span>`;
const tall = (h) => h > 1500;

/** 1. 종이 메모 — 크림색 바탕, 형광펜 밑줄, 큰 이모지 스티커 */
function paper(s, w, h, f) {
  const css = `body{width:${w}px;height:${h}px;background:#f4eee2;color:#1d1b17;padding:${tall(h) ? 160 : 96}px 90px}
  body:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(#0000 0 78px,#d9cfbd 78px 80px);opacity:.45}
  .brand{position:relative;font-size:34px;font-weight:700;color:#6b5f4b}.room{position:absolute;right:90px;top:${tall(h) ? 160 : 96}px;font-size:32px;font-weight:700;color:#6b5f4b}
  .stk{position:absolute;right:70px;top:${tall(h) ? 330 : 190}px;font-size:${tall(h) ? 230 : 170}px;transform:rotate(12deg)}
  .k{position:relative;margin-top:${tall(h) ? 300 : 150}px;font-size:42px;color:#7a6c55}
  h1{position:relative;margin-top:24px;font-size:${tall(h) ? 118 : 96}px;line-height:1.18;font-weight:700;letter-spacing:-4px;max-width:880px}
  h1 em{font-style:normal;background:linear-gradient(transparent 58%,#ffd84d 58%)}
  .list{position:relative;margin-top:60px;display:grid;gap:26px;font-size:46px}
  .list div{display:flex;gap:18px}.list b{font-weight:700}.list span{color:#7a6c55}
  .cta{position:absolute;left:90px;bottom:${tall(h) ? 230 : 100}px;font-size:46px;font-weight:700;border-bottom:6px solid #1d1b17;padding-bottom:8px}
  .sub{position:absolute;left:90px;bottom:${tall(h) ? 160 : 50}px;font-size:32px;color:#7a6c55}`;
  const list = `<div class="list">${s.items.map(([a, b]) => `<div>☐ <b>${esc(a)}</b><span>${esc(b)}</span></div>`).join("")}</div>`;
  const body =
    f === 2
      ? `<div class="k">${esc(s.sub)}</div><h1>${esc(s.big)}</h1>`
      : f === 1
        ? `<div class="k">${esc(s.kicker)}</div>${list}`
        : `<div class="k">${esc(s.kicker)}</div><h1>${titleHtml(s)}</h1>${f === "feed" ? list : ""}`;
  return { css, html: `${brand}<span class="room">${esc(s.room)}</span><span class="stk">${s.emoji}</span>${body}<span class="cta">${esc(s.cta)} →</span>${f === 2 || f === "feed" ? `<span class="sub">가입 없이 닉네임만 · nobangjang.com</span>` : ""}` };
}

/** 2. 팝 컬러 — 방 색 한 가지로 꽉 채운 바탕, 아주 큰 검은 글씨, 흰 알약 */
function pop(s, w, h, f) {
  const css = `body{width:${w}px;height:${h}px;background:${s.accent};color:#111;padding:${tall(h) ? 170 : 100}px 84px}
  .brand{font-size:36px;font-weight:700}.room{position:absolute;right:84px;top:${tall(h) ? 170 : 100}px;background:#111;color:${s.accent};font-size:30px;font-weight:700;padding:10px 22px;border-radius:999px}
  .k{margin-top:${tall(h) ? 260 : 120}px;font-size:44px;font-weight:700;opacity:.7}
  h1{margin-top:20px;font-size:${tall(h) ? 150 : 118}px;line-height:1.02;font-weight:700;letter-spacing:-7px}
  h1 em{font-style:normal;color:#fff;-webkit-text-stroke:3px #111}
  .pills{margin-top:64px;display:flex;flex-wrap:wrap;gap:18px}
  .pills span{background:#fff;border-radius:999px;padding:20px 34px;font-size:42px;font-weight:700}
  .pills i{font-style:normal;opacity:.45;margin:0 8px}
  .cta{position:absolute;left:84px;right:84px;bottom:${tall(h) ? 230 : 96}px;background:#111;color:#fff;font-size:48px;font-weight:700;border-radius:28px;padding:34px;text-align:center}`;
  const pills = `<div class="pills">${s.items.map(([a, b]) => `<span>${esc(a)}<i>vs</i>${esc(b)}</span>`).join("")}</div>`;
  const body =
    f === 2
      ? `<div class="k">${esc(s.sub)}</div><h1>${esc(s.big)}</h1>`
      : f === 1
        ? `<div class="k">${esc(s.kicker)}</div>${pills}`
        : `<div class="k">${s.emoji} ${esc(s.kicker)}</div><h1>${titleHtml(s)}</h1>${f === "feed" ? pills : ""}`;
  return { css, html: `${brand}<span class="room">${esc(s.room)}</span>${body}<div class="cta">${esc(s.cta)} →</div>` };
}

/** 3. 밸런스 게임 — 화면을 반으로 갈라 A(위) vs B(아래), 가운데 VS 원 */
function versus(s, w, h, f) {
  const [a, b] = s.items[0] ?? ["A", "B"];
  const css = `body{width:${w}px;height:${h}px;color:#fff;background:#111}
  .half{position:absolute;left:0;right:0;height:50%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;font-weight:700;letter-spacing:-4px;text-align:center;padding:0 60px}
  .top{top:0;background:${s.accent};color:#111}.bot{bottom:0;background:#1b1b22}
  .half b{font-size:${tall(h) ? 130 : 108}px;line-height:1.05}.half small{font-size:38px;letter-spacing:0;opacity:.7;font-weight:400}
  .vs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:200px;height:200px;border-radius:50%;background:#fff;color:#111;font-size:84px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 14px #111}
  .brand{position:absolute;left:60px;top:${tall(h) ? 120 : 50}px;font-size:34px;font-weight:700;color:#111;z-index:2}
  .room{position:absolute;right:60px;top:${tall(h) ? 120 : 50}px;font-size:30px;font-weight:700;color:#111;z-index:2}
  .q{position:absolute;left:0;right:0;bottom:${tall(h) ? 200 : 60}px;text-align:center;font-size:40px;font-weight:700;color:#fff}
  .list{position:absolute;inset:0;background:#111;padding:${tall(h) ? 300 : 180}px 80px;display:grid;align-content:start;gap:22px}
  .row{display:grid;grid-template-columns:1fr 90px 1fr;align-items:center;font-size:46px;font-weight:700;text-align:center}
  .row span:first-child{background:${s.accent};color:#111;border-radius:22px;padding:26px 10px}.row span:last-child{background:#2a2a33;border-radius:22px;padding:26px 10px}
  .row i{font-style:normal;color:#888;font-size:34px}
  .k{font-size:44px;font-weight:700;color:${s.accent};margin-bottom:24px}
  .end{position:absolute;inset:0;background:${s.accent};color:#111;display:flex;flex-direction:column;justify-content:center;padding:0 90px;gap:30px}
  .end h1{font-size:${tall(h) ? 130 : 108}px;letter-spacing:-6px;line-height:1.05}.end p{font-size:46px;font-weight:700}`;
  if (f === 1)
    return { css, html: `<div class="list"><div class="k">${esc(s.kicker)}</div>${s.items.map(([x, y]) => `<div class="row"><span>${esc(x)}</span><i>vs</i><span>${esc(y)}</span></div>`).join("")}</div>${brand.replace('class="brand"', 'class="brand" style="color:#fff"')}` };
  if (f === 2) return { css, html: `<div class="end"><h1>${esc(s.big)}</h1><p>${esc(s.sub)}</p><p>👉 ${esc(s.cta)}</p></div>${brand}` };
  return {
    css,
    html: `<div class="half top"><small>${esc(s.kicker)}</small><b>${esc(a)}</b></div><div class="half bot"><b>${esc(b)}</b><small>${esc(s.title)}</small></div><div class="vs">VS</div>${brand}<span class="room">${esc(s.room)}</span>${f === "feed" ? `<div class="q">당신은? 댓글로 👇 · nobangjang.com</div>` : ""}`,
  };
}

/** 4. 채팅방 — 카톡처럼 말풍선이 오가는 화면 (질문 → 답 → 초대) */
function chat(s, w, h, f) {
  const css = `body{width:${w}px;height:${h}px;background:#b2c7d9;color:#111;padding:${tall(h) ? 150 : 80}px 60px}
  .bar{display:flex;justify-content:space-between;align-items:center;font-size:40px;font-weight:700;margin-bottom:${tall(h) ? 80 : 40}px}
  .bar small{font-size:30px;font-weight:400;opacity:.6}
  .m{display:flex;gap:18px;margin:26px 0;align-items:flex-start}.m.me{justify-content:flex-end}
  .av{width:96px;height:96px;border-radius:34px;background:#1f5f4a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:48px;flex:none}
  .nm{font-size:28px;margin-bottom:8px;opacity:.7}
  .b{background:#fff;border-radius:8px 34px 34px 34px;padding:26px 34px;font-size:46px;line-height:1.35;max-width:760px}
  .me .b{background:#fee500;border-radius:34px 8px 34px 34px}
  .b em{font-style:normal;font-weight:700}
  .t{font-size:24px;opacity:.55;align-self:flex-end}
  .in{position:absolute;left:60px;right:60px;bottom:${tall(h) ? 200 : 60}px;background:#fff;border-radius:999px;padding:26px 40px;font-size:38px;color:#888;display:flex;justify-content:space-between}
  .in b{color:#111}`;
  const bot = (t) => `<div class="m"><div class="av">${s.emoji}</div><div><div class="nm">노방장</div><div class="b">${t}</div></div></div>`;
  const me = (t) => `<div class="m me"><span class="t">방금</span><div class="b">${t}</div></div>`;
  const msgs =
    f === 2
      ? [bot(`${esc(s.big)}`), bot(esc(s.sub)), me("나도 들어갈래요 🙋")]
      : f === 1
        ? s.items.slice(0, 4).map(([a, b], i) => (i % 2 ? me(`${esc(a)}! ${esc(b)}보다 이게 좋아요`) : bot(`<em>${esc(a)}</em> vs ${esc(b)}?`)))
        : [bot(esc(s.kicker)), bot(titleHtml(s)), ...(f === "feed" ? s.items.slice(0, 2).map(([a, b]) => me(`${esc(a)} 파예요 (${esc(b)} 아님)`)) : [])];
  return { css, html: `<div class="bar">${esc(s.room)} <small>👥 같이 수다</small></div>${msgs.join("")}<div class="in">메시지 입력… <b>${esc(s.cta)} →</b></div>` };
}

/** 5. 큰 숫자 — 실제 통계 하나를 화면 가득 (테스트 결과·순위용). big 은 숫자 문자열 */
function stat(s, w, h, f) {
  const css = `body{width:${w}px;height:${h}px;background:#fbfaf7;color:#111;padding:${tall(h) ? 170 : 100}px 84px}
  .brand{font-size:34px;font-weight:700}.room{position:absolute;right:84px;top:${tall(h) ? 170 : 100}px;font-size:30px;font-weight:700;color:${s.accent}}
  .k{margin-top:${tall(h) ? 250 : 110}px;font-size:46px;font-weight:700;color:#666}
  .n{font-size:${tall(h) ? 330 : 270}px;font-weight:700;letter-spacing:-16px;line-height:1;color:${s.accent};margin-top:10px}
  h1{font-size:${tall(h) ? 84 : 70}px;letter-spacing:-3px;line-height:1.18;margin-top:24px}
  .bars{margin-top:60px;display:grid;gap:22px}
  .bar{display:grid;grid-template-columns:250px 1fr 120px;align-items:center;gap:20px;font-size:40px;font-weight:700}
  .bar i{display:block;height:44px;border-radius:12px;background:${s.accent}}
  .bar span:last-child{text-align:right;color:#666}
  .cta{position:absolute;left:84px;bottom:${tall(h) ? 220 : 90}px;font-size:46px;font-weight:700;color:#fff;background:#111;border-radius:999px;padding:26px 46px}
  .src{position:absolute;right:84px;bottom:${tall(h) ? 236 : 106}px;font-size:28px;color:#999;text-align:right}`;
  const max = Math.max(1, ...s.items.map(([, v]) => parseFloat(v) || 0));
  const bars = `<div class="bars">${s.items.map(([a, v]) => `<div class="bar"><span>${esc(a)}</span><i style="width:${Math.max(8, ((parseFloat(v) || 0) / max) * 100)}%"></i><span>${esc(v)}</span></div>`).join("")}</div>`;
  const body =
    f === 2
      ? `<div class="k">${esc(s.sub)}</div><h1>${esc(s.cta)}<br>당신은 어디에?</h1>`
      : f === 1
        ? `<div class="k">${esc(s.kicker)}</div>${bars}`
        : `<div class="k">${esc(s.kicker)}</div><div class="n">${esc(s.big)}</div><h1>${titleHtml(s)}</h1>${f === "feed" ? bars : ""}`;
  return { css, html: `${brand}<span class="room">${esc(s.room)}</span>${body}<span class="cta">${esc(s.cta)} →</span><span class="src">실제 참여 기록 기준</span>` };
}

/** 6. 티켓 — 행사·일정 글용. 절취선 있는 입장권 모양 */
function ticket(s, w, h, f) {
  const css = `body{width:${w}px;height:${h}px;background:#20232b;color:#111;padding:${tall(h) ? 230 : 110}px 70px;display:flex;flex-direction:column}
  .tk{position:relative;background:#fffaf0;border-radius:36px;padding:70px 64px;flex:${f === "feed" ? "none" : "1"}}
  .tk:before,.tk:after{content:"";position:absolute;left:-36px;top:58%;width:72px;height:72px;border-radius:50%;background:#20232b}.tk:after{left:auto;right:-36px}
  .cut{position:absolute;left:50px;right:50px;top:calc(58% + 36px);border-top:6px dashed #d6ccb8}
  .top{display:flex;justify-content:space-between;font-size:32px;font-weight:700;color:#8a7f6b}
  .k{margin-top:50px;font-size:42px;font-weight:700;color:${s.accent};filter:brightness(.8)}
  h1{margin-top:16px;font-size:${tall(h) ? 112 : 92}px;line-height:1.1;letter-spacing:-4px}
  h1 em{font-style:normal;color:${s.accent};filter:brightness(.75)}
  .rows{position:absolute;left:64px;right:64px;top:calc(58% + 80px);display:grid;gap:20px;font-size:42px}
  .rows div{display:flex;justify-content:space-between;gap:20px}.rows b{font-weight:700}.rows span{color:#6b6253}
  .stub{margin-top:34px;display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:40px;font-weight:700}
  .stub span:last-child{background:${s.accent};color:#111;border-radius:999px;padding:22px 40px}`;
  const rows = `<div class="rows">${s.items.map(([a, b]) => `<div><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join("")}</div>`;
  const inner =
    f === 2
      ? `<div class="k">${esc(s.sub)}</div><h1>${esc(s.big)}</h1>`
      : `<div class="k">${s.emoji} ${esc(s.kicker)}</div><h1>${titleHtml(s)}</h1>`;
  return {
    css: css + (f === "feed" ? `.tk{height:${h - 360}px}` : ""),
    html: `<div class="tk"><div class="top"><span>🏠 노방장</span><span>${esc(s.room)}</span></div>${inner}<div class="cut"></div>${f === 2 ? "" : rows}</div><div class="stub"><span>공식 안내 꼭 확인</span><span>${esc(s.cta)} →</span></div>`,
  };
}

export const STYLES = { paper, pop, versus, chat, stat, ticket };
export const page = (style, s, w, h, f) => {
  const { css, html } = STYLES[style](s, w, h, f);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${font}${css}</style></head><body>${html}</body></html>`;
};
