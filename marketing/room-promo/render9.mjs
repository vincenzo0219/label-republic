// 10/21~ SNS 카드 (디자인 틀 6가지, styles.mjs). 사용: node render9.mjs <출력 폴더> <spec.json>
// spec.json = [{ name, style: "paper"|"pop"|"versus"|"chat"|"stat"|"ticket"|"adticket"|"checklist", room, emoji, accent, kicker, title, em, items, big, sub, cta }]
// 결과: <name>-feed.png (1080×1350) + <name>-0/1/2.png (1080×1920 릴스 프레임 → motion.sh)
// 규칙: 하루 8개 안에서 같은 style 은 2번까지, 바로 앞 게시물과 다른 style.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import { page } from "./styles.mjs";
const [out, specPath] = process.argv.slice(2);
const specs = JSON.parse(fs.readFileSync(specPath, "utf8"));
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const s of specs) {
  for (const [f, w, h, file] of [["feed", 1080, 1350, `${s.name}-feed`], [0, 1080, 1920, `${s.name}-0`], [1, 1080, 1920, `${s.name}-1`], [2, 1080, 1920, `${s.name}-2`]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const html = `${out}/${file}.html`;
    fs.writeFileSync(html, page(s.style, s, w, h, f));
    await p.goto(`file://${html}`, { waitUntil: "load" });
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${out}/${file}.png` });
    await p.close();
  }
}
await b.close();
