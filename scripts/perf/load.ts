/**
 * 의존성 없는 간단한 부하 테스트.
 *
 *   npx tsx scripts/perf/load.ts [--base http://localhost:3000] [--duration 15] [--concurrency 20]
 *                                [--only 이름일부] [--writes] [--json out.json]
 *
 * 시나리오마다 정해진 시간 동안 동시 요청을 보내고 처리량·지연(p50/p95/p99)·오류 수를 출력한다.
 * 부하 테스트용 DB(scripts/perf/seed.sql)를 붙인 운영 빌드(`npm run build && npm start`)에 대고 돌릴 것.
 *
 * --writes: 투표·댓글 쓰기 시나리오도 돌린다 (DB에 데이터가 쌓인다 — 운영 DB 금지).
 *   요청마다 User-Agent 를 바꿔 서로 다른 사람(fingerprint)처럼 보내므로 1인 레이트 리밋에 걸리지 않는다.
 *   TRUST_PROXY 를 켠 서버라면 X-Forwarded-For 도 바꾼다.
 */
import { writeFileSync } from "node:fs";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : def;
};
const base = arg("base", "http://localhost:3000");
const duration = Number(arg("duration", "15")) * 1000;
const concurrency = Number(arg("concurrency", "20"));
const only = arg("only", "");
const jsonOut = arg("json", "");
const writes = process.argv.includes("--writes");
let seq = 0;
const person = () => {
  const n = ++seq;
  return { "user-agent": `labelrep-loadtest/${n}`, "x-forwarded-for": `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` };
};

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]) => a[rand(a.length)]!;
const TERMS = ["마그네슘", "비교", "성분표 함량", "스위치 윤활", "오메가3", "사료 첨가물", "철분", "비오틴", "철분 윤활", "zz", "없는검색어"];
const BOARDS = ["supplements", "keyboards", "deskterior", "pet-food", "perfume-audio"];

let maxPostId = 200000;
/** 보이는 글이 있는 제품 번호 (시작할 때 API 로 모은다) */
let productIds: string[] = ["1"];
const get = (): RequestInit => ({ headers: person(), redirect: "manual" });

type Scenario = { name: string; path: () => string; init?: () => RequestInit };
const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...person() },
  body: JSON.stringify(body),
});
const scenarios: Scenario[] = [
  { name: "홈 (신뢰도순)", path: () => "/" },
  { name: "홈 최신순 3페이지", path: () => "/?sort=latest&page=3" },
  { name: "보드 (신뢰도순)", path: () => `/c/${pick(BOARDS)}` },
  { name: "보드 추천순 깊은 페이지", path: () => `/c/${pick(BOARDS)}?sort=votes&page=${20 + rand(30)}` },
  { name: "글 상세", path: () => `/posts/${1 + rand(maxPostId)}` },
  { name: "검색", path: () => `/search?q=${encodeURIComponent(pick(TERMS))}&sort=${pick(["trust", "latest", "votes"])}` },
  { name: "API 목록", path: () => `/api/posts?category=${pick(BOARDS)}&sort=trust` },
  { name: "API 댓글", path: () => `/api/posts/${1 + rand(maxPostId)}/comments` },
  { name: "리포트 API", path: () => `/api/report?boards=${BOARDS.slice(0, 3).join(",")}&since=${new Date(Date.now() - 7 * 86400_000).toISOString()}` },
  { name: "피드", path: () => "/feed.xml" },
  // Sprint 14~17
  { name: "제품 페이지", path: () => `/p/${pick(productIds)}` },
  { name: "제품 비교", path: () => `/compare?ids=${pick(productIds)},${pick(productIds)},${pick(productIds)}` },
  { name: "성분 순위", path: () => `/c/${pick(BOARDS)}/facts?attr=${encodeURIComponent(pick(["마그네슘", "아연", "비타민d"]))}` },
  { name: "수치 조건 검색", path: () => `/search?q=${encodeURIComponent(`${pick(["마그네슘", "아연", "비타민D"])} ${pick([100, 120, 140])}mg 이상`)}` },
  { name: "수정 이력", path: () => `/posts/${1 + rand(maxPostId)}/history` },
  {
    // 사람마다 관심 제품 10개·글 20개 — 요청마다 다른 사람(1인 레이트 리밋을 피해 서버 부담만 잰다)
    name: "리포트 API (관심 제품·글)",
    path: () =>
      `/api/report?count=1&products=${Array.from({ length: 10 }, () => pick(productIds)).join(",")}&posts=${Array.from({ length: 20 }, () => 1 + rand(maxPostId)).join(",")}&since=${new Date(Date.now() - 7 * 86400_000).toISOString()}`,
    init: get,
  },
];
const writeScenarios: Scenario[] = [
  // 인기 글 하나에 투표가 몰리는 경우 — 같은 행 잠금 경합
  { name: "투표 (한 글에 몰림)", path: () => `/api/posts/${hotPostId}/vote`, init: () => post({ value: 1 }) },
  { name: "투표 (여러 글)", path: () => `/api/posts/${1 + rand(maxPostId)}/vote`, init: () => post({ value: Math.random() < 0.8 ? 1 : -1 }) },
  {
    name: "댓글 작성",
    path: () => `/api/posts/${1 + rand(maxPostId)}/comments`,
    init: () => post({ nickname: "부하테스트", pw: "1234", body: "부하 테스트 댓글입니다. 측정값 공유 감사합니다." }),
  },
];
let hotPostId = 1;

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function run(s: Scenario) {
  const lat: number[] = [];
  const status = new Map<number, number>();
  let errors = 0;
  const end = Date.now() + duration;
  const worker = async () => {
    while (Date.now() < end) {
      const t = performance.now();
      try {
        const res = await fetch(base + s.path(), s.init?.() ?? { headers: { "user-agent": "labelrep-loadtest" }, redirect: "manual" });
        await res.arrayBuffer();
        status.set(res.status, (status.get(res.status) ?? 0) + 1);
        if (res.status >= 500) errors++;
      } catch {
        errors++;
      }
      lat.push(performance.now() - t);
    }
  };
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const secs = (Date.now() - started) / 1000;
  lat.sort((a, b) => a - b);
  return {
    name: s.name,
    requests: lat.length,
    rps: Math.round(lat.length / secs),
    p50: Math.round(pct(lat, 50)),
    p95: Math.round(pct(lat, 95)),
    p99: Math.round(pct(lat, 99)),
    errors,
    status: Object.fromEntries(status),
  };
}

async function main() {
  const health = await fetch(`${base}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health) throw new Error(`${base} 에 연결할 수 없습니다`);
  const latest = await fetch(`${base}/api/posts?sort=latest&pageSize=1`).then((r) => r.json()).catch(() => null);
  const id = Number(latest?.items?.[0]?.id);
  if (id > 0) maxPostId = id;
  hotPostId = Math.max(1, maxPostId - 10);
  const found = new Set<string>();
  for (const q of ["brand1", "brand2", "brand3", "product 1", "mag", "now"]) {
    const r = await fetch(`${base}/api/products?q=${encodeURIComponent(q)}`, { headers: person() }).then((x) => x.json()).catch(() => null);
    for (const it of r?.items ?? []) found.add(it.id);
  }
  if (found.size) productIds = [...found];
  console.log(`대상 ${base} · 시나리오당 ${duration / 1000}초 · 동시 ${concurrency}`);
  const results = [];
  for (const s of [...scenarios, ...(writes ? writeScenarios : [])].filter((x) => !only || x.name.includes(only))) {
    const r = await run(s);
    results.push(r);
    console.log(
      `${r.name.padEnd(16)} ${String(r.rps).padStart(5)} req/s  p50 ${String(r.p50).padStart(5)}ms  p95 ${String(r.p95).padStart(5)}ms  p99 ${String(r.p99).padStart(5)}ms  오류 ${r.errors}  ${JSON.stringify(r.status)}`,
    );
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
