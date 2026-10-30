// 10/30 주식방 유료 광고 릴스 (checklist 틀 + 모든 프레임 아래 "종목 추천이 아니에요 · 투자 판단은 본인 책임").
// 사용: node render-ad-stock.mjs <출력 폴더> <spec.json> → <name>-feed.png(1080×1350) + <name>-0/1/2.png(1080×1920)
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import { page } from "./styles.mjs";
const [out, specPath] = process.argv.slice(2);
const specs = JSON.parse(fs.readFileSync(specPath, "utf8"));
const disc = (h) =>
  `<div style="position:absolute;left:0;right:0;bottom:${h > 1500 ? 300 : 18}px;text-align:center;font-size:34px;font-weight:700;color:#3d5248;z-index:9">종목 추천이 아니에요 · 투자 판단은 본인 책임</div>`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const s of specs) {
  for (const [f, w, h, file] of [["feed", 1080, 1350, `${s.name}-feed`], [0, 1080, 1920, `${s.name}-0`], [1, 1080, 1920, `${s.name}-1`], [2, 1080, 1920, `${s.name}-2`]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const html = `${out}/${file}.html`;
    fs.writeFileSync(html, page("checklist", s, w, h, f).replace("</body>", `${disc(h)}</body>`));
    await p.goto(`file://${html}`, { waitUntil: "load" });
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${out}/${file}.png` });
    await p.close();
  }
}
await b.close();
