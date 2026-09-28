/**
 * 모바일 체감 속도 측정 + 예산 검사 (Sprint 22).
 *
 * Lighthouse 모바일과 같은 조건(느린 4G: 150ms·1.6Mbps, CPU 4배 느리게, 412×915 화면)으로 주요 화면을 열어
 * LCP·CLS·TBT·전송량을 재고, 예산을 넘으면 종료 코드 1.
 *
 *   BASE_URL=http://localhost:3000 node scripts/perf/mobile.mjs          # 운영 빌드(next build + start)에 대고
 *   RUNS=5 node scripts/perf/mobile.mjs /c/supplements /rules            # 화면을 직접 고르기
 *
 * playwright 가 필요합니다: npm i -D playwright, 또는 전역 설치본을 PLAYWRIGHT_MODULE=/경로/playwright/index.mjs 로 지정. 첫 바이트(TTFB)는 서버·DB 상태에 따라
 * 크게 흔들리므로 예산에 넣지 않고 표시만 합니다.
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const B = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const RUNS = Number(process.env.RUNS ?? 3);
/** 예산 (중앙값 기준) — 넘으면 실패 */
const BUDGET = { lcp: 2500, cls: 0.1, tbt: 300, jsKB: 170, htmlKB: 60, dom: 1500 };

async function discover() {
  const pages = ["/", "/c/supplements", "/search?q=" + encodeURIComponent("마그네슘"), "/write", "/rules", "/me"];
  try {
    const { items } = await (await fetch(`${B}/api/posts?sort=latest`)).json();
    const withPhoto = items.find((p) => p.thumb_id);
    if (withPhoto) pages.push(`/posts/${withPhoto.id}`);
    const withProducts = items.find((p) => p.products?.length);
    if (withProducts) pages.push(`/posts/${withProducts.id}`, `/p/${withProducts.products[0].id}`);
  } catch {}
  return [...new Set(pages)];
}

const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const browser = await chromium.launch();

async function measure(path) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, serviceWorkers: "block",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const bytes = {};
  const kind = new Map();
  cdp.on("Network.responseReceived", (e) => kind.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    const t = kind.get(e.requestId) ?? "Other";
    bytes[t] = (bytes[t] ?? 0) + e.encodedDataLength;
  });
  await page.addInitScript(() => {
    const v = (window.__perf = { lcp: 0, cls: 0, lt: [] });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) v.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) v.lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true });
  });
  await page.goto(B + path, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(3000);
  const v = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const p = window.__perf;
    return {
      ttfb: nav.responseStart, fcp, lcp: p.lcp, cls: p.cls,
      tbt: p.lt.filter(([s]) => s >= fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0),
      dom: document.getElementsByTagName("*").length,
    };
  });
  await ctx.close();
  return { ...v, jsKB: (bytes.Script ?? 0) / 1024, htmlKB: (bytes.Document ?? 0) / 1024, imgKB: (bytes.Image ?? 0) / 1024 };
}

const paths = process.argv.slice(2).length ? process.argv.slice(2) : await discover();
let failed = 0;
console.log(`조건: 느린 4G + CPU 4배, ${RUNS}회 중앙값 · 예산 LCP ≤ ${BUDGET.lcp}ms, CLS ≤ ${BUDGET.cls}, TBT ≤ ${BUDGET.tbt}ms, JS ≤ ${BUDGET.jsKB}KB, HTML ≤ ${BUDGET.htmlKB}KB, DOM ≤ ${BUDGET.dom}`);
for (const path of paths) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measure(path));
  const m = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, median(runs.map((r) => r[k]))]));
  const over = Object.entries(BUDGET).filter(([k, limit]) => m[k] > limit).map(([k]) => k);
  if (over.length) failed++;
  console.log(
    `${over.length ? "✗" : "✓"} ${path}  TTFB ${m.ttfb | 0}ms · FCP ${m.fcp | 0} · LCP ${m.lcp | 0} · CLS ${m.cls.toFixed(3)} · TBT ${m.tbt | 0} · ` +
      `JS ${m.jsKB | 0}KB · HTML ${m.htmlKB | 0}KB · IMG ${m.imgKB | 0}KB · DOM ${m.dom}${over.length ? `  ← 예산 초과: ${over.join(", ")}` : ""}`,
  );
}
await browser.close();
process.exit(failed ? 1 : 0);
