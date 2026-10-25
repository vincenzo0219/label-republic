#!/usr/bin/env node
/**
 * 비즈파일럿 주간 원고(md) → 🏪 오늘도 장사중 글 대기열 (shop_queue). docs/promo/bizpilot-room.md
 *
 * 평소엔 서버가 비즈파일럿 피드(https://bizpilot.kr/nobangjang/feed.json)를 10분마다 읽어 알아서 올린다. 이 스크립트는
 *   - 질문형 제목을 단정문으로 바꾼 제목을 서버에 넣고 (titles — 피드 글에도 적용, 칸 key 가 피드 id 와 같아서)
 *   - 피드가 안 될 때 원고 md 로 직접 채우는 대비책 (같은 key 라 피드와 겹쳐 두 번 올라가지 않는다)
 *
 *   node scripts/bizpilot-import.mjs <원고.md> [--overrides 고칠것.json]            # 미리 보기 (아무것도 보내지 않음)
 *   node scripts/bizpilot-import.mjs <원고.md> [--overrides 고칠것.json] --send     # 서버 대기열에 넣기
 *     --send 는 NOBANGJANG_ADMIN_PASSWORD(관리자 Basic 인증)가 필요하다. --titles-only 면 바꾼 제목만 보낸다 (피드가 잘 될 때)
 *     --base https://nobangjang.com (기본) · --year 2026 (기본: 오늘 기준 가까운 해) · --json (변환 결과를 JSON 으로)
 *
 * 원고 모양 (비즈파일럿이 매주 일요일 보내는 그대로):
 *   ## 3-1. 탭별 고정 글 …
 *   ### 💸 남는 돈 계산 · 📌 자주 묻는 질문 정답      ← 탭 맨 위 고정 글 (있을 때만, 같은 탭이면 고친다)
 *   (본문)
 *   ## 날짜별 글
 *   ### 10/26
 *   #### 08:30 · 👥 직원·알바                      ← 시각 · 탭
 *   (첫 줄 = 제목, 나머지 = 본문, "그림:" 줄 = 붙일 그림 주소들)
 *
 * 사이트 규칙으로 바꾸는 것:
 *   - 제목 앞에 탭 표시 [계산]·[직원]·[상권]·[지원]·[가게]
 *   - 제목이 질문이면 고칠것.json 의 titles["10/26 08:30"] 이 있어야 한다 (본문에 있는 숫자만, 없으면 멈춤)
 *   - 첫 줄이 여러 문장이고 길면 첫 문장만 제목, 나머지는 본문 맨 앞으로
 *   - "댓글로 알려 주세요"·"저장해 두고"·"친구에게도 공유" 같은 문장, 고칠것.json 의 drop["10/30 10:30"] 문장은 뺀다
 *   - em dash(—)는 쉼표로, bizpilot 주소는 ☀️ 아침 계산 글에만(utm_source=nobangjang)
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** 원고의 탭 이름 → 말머리 키 (src/lib/heads.ts SHOP_HEADS 와 같게) */
export const TABS = [
  { key: "계산", name: "남는 돈 계산" },
  { key: "직원", name: "직원·알바" },
  { key: "상권", name: "상권·자리" },
  { key: "지원", name: "지원사업·마감" },
  { key: "가게", name: "잘된 가게" },
];
/** 칸 key = 피드 id "2026-10-26-0830" */
export const slotId = (ymd, hm) => `${ymd}-${hm.replace(":", "")}`;
export const SLOTS = ["08:30", "10:30", "14:30", "16:00", "22:30"];
const squash = (s) => s.replace(/[\s\p{Extended_Pictographic}️‍]/gu, "");

/** "👥 직원·알바" → "직원" (자유채팅·모르는 탭이면 null) */
export function tabKey(label) {
  const l = squash(label);
  return TABS.find((t) => l.includes(squash(t.name)))?.key ?? null;
}

const DASH = /\s*[—―]\s*/g;
export const noDash = (s) => s.replace(DASH, ", ");

/** 문장 나누기: 마침표·물음표·느낌표(·👇📌) 뒤 띄어쓰기에서만 (4.4배·3,000만원은 그대로) */
export const sentences = (line) => line.split(/(?<=[.!?。]["”'’)\]]*|[👇📌])\s+/u).map((x) => x.trim()).filter(Boolean);

/** 사이트 글 끝에 두지 않는 부탁·유도 문장 */
export const CTA = [/댓글로[^.!?]*(?:알려|남겨|적어)\s*주세요/, /저장해\s*두고/, /친구에게도\s*공유/, /팔로우/, /좋아요\s*(?:꾹|눌러)/];
const isCta = (s) => CTA.some((re) => re.test(s));
const isQuestion = (s) => /\?\s*["”'’)]?\s*$/.test(s.trim());
/** 따옴표 안 질문("…왜 나갔나요?")은 독자에게 묻는 문장이 아니라 인용이다 */
const quotedQuestion = (s) => /["“][^"”]*\?["”]\s*$/.test(s.trim());

const BIZ = /https?:\/\/(?:www\.)?bizpilot\.kr\S*/g;
export function siteLink(url) {
  const u = new URL(url);
  u.searchParams.set("utm_source", "nobangjang");
  return u.toString();
}

/** 숫자 토큰 (1,000 · 4.4 · 70) */
const numbers = (s) => (s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]$/, "").replace(/,/g, ""));

/** 제목 앞 "[☀️ 아침 계산 #1]" → { prefix, corner, rest } */
export function splitCorner(title) {
  const m = /^(\[([^\]]+?)\s*#\d+\])\s*(.*)$/u.exec(title.trim());
  return m ? { prefix: m[1], corner: squash(m[2]), rest: m[3] } : { prefix: "", corner: "", rest: title.trim() };
}

/**
 * 칸 하나 변환. raw = "#### 시각 · 탭" 아래 원문 그대로.
 * 돌려주는 problems 가 있으면 보내지 않는다 (warnings 는 사람이 보고 판단)
 */
export function convertItem(raw, { slotKey, head, overrides = {}, faq = false }) {
  const problems = [];
  const warnings = [];
  const lines = raw.replace(/\r/g, "").split("\n");
  const imageUrls = [];
  const kept = [];
  for (const line of lines) {
    const m = /^\s*그림\s*:\s*(.+)$/.exec(line);
    if (m) {
      imageUrls.push(...m[1].trim().split(/\s+/).filter((u) => /^https?:\/\//.test(u)));
      continue;
    }
    kept.push(line);
  }
  while (kept.length && !kept[0].trim()) kept.shift();
  if (!kept.length) return { problems: ["빈 칸"], warnings, title: "", body: "", imageUrls };
  if (/[—―]/.test(raw)) warnings.push("em dash 를 쉼표로 바꿨어요");
  const firstLine = noDash(kept[0].trim());
  const { prefix, corner, rest } = splitCorner(firstLine);
  const morning = corner.includes("아침계산");
  const drops = new Set((overrides.drop?.[slotKey] ?? []).map((s) => s.trim()));

  // 제목: 질문이면 고칠것.json, 여러 문장이고 길면 첫 문장만
  let titleText = rest;
  let lead = "";
  const override = overrides.titles?.[slotKey];
  if (override) {
    titleText = noDash(override.trim()).replace(/^\[[^\]]+#\d+\]\s*/u, "");
  } else {
    const ss = sentences(rest);
    if (ss.length > 1 && rest.length > 45) {
      titleText = ss[0];
      lead = ss.slice(1).join(" ");
    }
    if (isQuestion(titleText) && !faq) problems.push(`제목이 질문이에요: titles["${slotKey}"] 를 넣어 주세요 (본문에 있는 숫자만)`);
  }
  titleText = titleText.replace(/\.$/, "").trim();

  // 본문
  const bodyLines = [];
  if (lead) bodyLines.push(lead, "");
  for (const line0 of kept.slice(1)) {
    let line = noDash(line0.trimEnd());
    if (!faq && BIZ.test(line)) {
      BIZ.lastIndex = 0;
      if (!morning) {
        warnings.push(`아침 계산이 아닌 글의 bizpilot 주소 줄을 뺐어요: ${line.trim()}`);
        continue;
      }
      line = line.replace(BIZ, (u) => siteLink(u));
    }
    BIZ.lastIndex = 0;
    if (line.trim()) {
      const ss = sentences(line.trim());
      const left = ss.filter((s) => !isCta(s) && !drops.has(s));
      if (left.length !== ss.length) {
        if (!left.length) continue;
        line = left.join(" ");
      }
    }
    bodyLines.push(line);
  }
  let body = bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  for (const d of drops) if (!raw.includes(d)) warnings.push(`drop 문장을 원문에서 못 찾았어요: ${d}`);
  if (morning && !BIZ.test(body)) warnings.push("아침 계산 글에 bizpilot 주소가 없어요");
  BIZ.lastIndex = 0;
  const lastLine = body.split("\n").filter((l) => l.trim()).pop() ?? "";
  const lastSentence = sentences(lastLine).pop() ?? "";
  if (!faq && isQuestion(lastSentence) && !quotedQuestion(lastSentence)) problems.push(`본문이 질문으로 끝나요: ${lastSentence}`);
  for (const l of body.split("\n")) for (const s of sentences(l)) if (!faq && isQuestion(s) && !quotedQuestion(s)) warnings.push(`본문 질문 문장: ${s}`);
  if (override) {
    const have = new Set(numbers(raw));
    const extra = numbers(titleText).filter((n) => !have.has(n));
    if (extra.length) problems.push(`고친 제목에 원문에 없는 숫자: ${extra.join(", ")}`);
  }
  if (imageUrls.length > 6) problems.push("그림은 6장까지");
  const title = `[${head}] ${prefix ? `${prefix} ` : ""}${titleText}`;
  if ([...title].length > 120) problems.push("제목이 120자를 넘어요");
  return { problems, warnings, title, body, imageUrls };
}

/** 원고 전체 → 고정 글들 + 날짜별 글들 */
export function parseHandoff(md, { year, overrides = {} } = {}) {
  const lines = md.replace(/\r/g, "").split("\n");
  const blocks = [];
  let section = "";
  let cur = null;
  let date = null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  for (const line of lines) {
    let m;
    if ((m = /^##\s+(.*)$/.exec(line))) {
      flush();
      section = /3-1|고정/.test(m[1]) ? "faq" : /날짜별/.test(m[1]) ? "days" : "";
      continue;
    }
    if (section === "faq" && (m = /^###\s+(.+?)\s*·\s*(📌.*)$/u.exec(line))) {
      flush();
      cur = { kind: "faq", label: m[1].trim(), title: m[2].trim(), lines: [] };
      continue;
    }
    if (section === "days" && (m = /^###\s+(\d{1,2})\/(\d{1,2})\b/.exec(line))) {
      flush();
      date = { m: Number(m[1]), d: Number(m[2]) };
      continue;
    }
    if (section === "days" && (m = /^####\s+(\d{1,2}):(\d{2})\s*·\s*(.+)$/.exec(line))) {
      flush();
      cur = { kind: "post", date, hm: `${m[1].padStart(2, "0")}:${m[2]}`, label: m[3].trim(), lines: [] };
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      flush();
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  flush();

  const y = year ?? new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
  const faqs = [];
  const posts = [];
  for (const b of blocks) {
    const head = tabKey(b.label);
    if (b.kind === "faq") {
      const key = `pin:${head}`;
      if (!head) {
        faqs.push({ key, label: b.label, problems: [`모르는 탭: ${b.label}`], warnings: [] });
        continue;
      }
      const r = convertItem(`${b.title}\n${b.lines.join("\n")}`, { slotKey: key, head, overrides, faq: true });
      faqs.push({ key, head, label: b.label, pinned: true, ...r });
      continue;
    }
    const ymd = `${y}-${String(b.date.m).padStart(2, "0")}-${String(b.date.d).padStart(2, "0")}`;
    const slotKey = `${b.date.m}/${String(b.date.d).padStart(2, "0")} ${b.hm}`;
    const alt = `${String(b.date.m).padStart(2, "0")}/${String(b.date.d).padStart(2, "0")} ${b.hm}`;
    const ov = { titles: { ...overrides.titles }, drop: { ...overrides.drop } };
    // 고칠것.json 은 "10/26 08:30" 으로 쓴다 (앞 0 이 있어도 된다)
    for (const k of [alt, `${b.date.m}/${b.date.d} ${b.hm}`]) {
      if (overrides.titles?.[k]) ov.titles[slotKey] = overrides.titles[k];
      if (overrides.drop?.[k]) ov.drop[slotKey] = overrides.drop[k];
    }
    if (!head) {
      posts.push({ key: slotId(ymd, b.hm), slotKey, label: b.label, problems: [`자동 글을 올리지 않는 탭이거나 모르는 탭: ${b.label}`], warnings: [] });
      continue;
    }
    const r = convertItem(b.lines.join("\n"), { slotKey, head, overrides: ov });
    r.retitled = !!ov.titles[slotKey];
    if (!SLOTS.includes(b.hm)) r.warnings.push(`정해진 다섯 시각이 아니에요: ${b.hm}`);
    posts.push({ key: slotId(ymd, b.hm), slotKey, head, label: b.label, publishAt: `${ymd}T${b.hm}:00+09:00`, pinned: false, ...r });
  }
  return { faqs, posts };
}

// ---------------------------------------------------------------------------
async function main(argv) {
  const args = { files: [], send: false, json: false, base: "https://nobangjang.com", includePast: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--send") args.send = true;
    else if (a === "--json") args.json = true;
    else if (a === "--include-past") args.includePast = true;
    else if (a === "--titles-only") args.titlesOnly = true;
    else if (a === "--overrides") args.overrides = argv[++i];
    else if (a === "--pin") args.pin = argv[++i];
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--year") args.year = Number(argv[++i]);
    else args.files.push(a);
  }
  if (args.files.length !== 1) {
    console.error("사용법: node scripts/bizpilot-import.mjs <원고.md> [--overrides 고칠것.json] [--send]");
    process.exit(2);
  }
  const overrides = args.overrides ? JSON.parse(fs.readFileSync(args.overrides, "utf8")) : {};
  const { faqs, posts } = parseHandoff(fs.readFileSync(args.files[0], "utf8"), { year: args.year, overrides });
  const all = [...faqs, ...posts];
  if (args.json) {
    console.log(JSON.stringify({ faqs, posts }, null, 2));
  } else {
    for (const it of all) {
      console.log(`\n■ ${it.key}${it.pinned ? " (고정)" : ""}  ${it.title ?? ""}${it.imageUrls?.length ? `  🖼${it.imageUrls.length}` : ""}`);
      for (const w of it.warnings) console.log(`   ⚠ ${w}`);
      for (const p of it.problems) console.log(`   ✖ ${p}`);
    }
  }
  const bad = all.filter((it) => it.problems.length);
  console.error(`\n고정 글 ${faqs.length}개, 날짜별 글 ${posts.length}개${bad.length ? ` · 고칠 것 ${bad.length}개 (보내지 않음)` : ""}`);
  if (bad.length) process.exit(1);
  if (!args.send) return;

  const password = process.env.NOBANGJANG_ADMIN_PASSWORD;
  const pin = args.pin ?? process.env.BIZPILOT_PIN;
  if (!password) {
    console.error("--send 에는 NOBANGJANG_ADMIN_PASSWORD 가 필요해요");
    process.exit(2);
  }
  const auth = `Basic ${Buffer.from(`admin:${password}`).toString("base64")}`;
  const post = async (payload) => {
    const res = await fetch(`${args.base}/api/admin/shop-queue`, {
      method: "POST",
      headers: { Authorization: auth, Origin: args.base, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { res, out: await res.json().catch(() => ({})) };
  };
  // 1) 바꾼 제목 (피드 글에도 적용)
  const titles = Object.fromEntries(posts.filter((p) => p.retitled).map((p) => [p.key, p.title]));
  if (Object.keys(titles).length) {
    const { res, out } = await post({ action: "titles", titles });
    console.log(`${res.ok ? "✔" : "✖"} 제목 바꾸기 ${Object.keys(titles).length}개 ${res.ok ? "" : `${res.status} ${out.message ?? ""}`}`);
    if (!res.ok) process.exitCode = 1;
  }
  if (args.titlesOnly) return;
  // 2) 칸 넣기 (피드와 같은 key — 이미 올라간 칸은 서버가 건드리지 않는다)
  const now = Date.now();
  for (const it of all) {
    if (!it.pinned && Date.parse(it.publishAt) < now && !args.includePast) {
      console.log(`건너뜀 (지난 시각): ${it.key}`);
      continue;
    }
    const payload = { action: "upsert", key: it.key, head: it.head, title: it.title, body: it.body, imageUrls: it.imageUrls, pinned: !!it.pinned, ...(pin ? { pin } : {}), ...(it.publishAt ? { publishAt: it.publishAt } : {}) };
    const { res, out } = await post(payload);
    console.log(`${res.ok ? "✔" : "✖"} ${it.key} ${res.ok ? `${out.status} 🖼${out.images}` : `${res.status} ${out.message ?? out.error ?? ""}`}`);
    if (!res.ok) process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
