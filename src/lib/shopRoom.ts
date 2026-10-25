/**
 * 🏪 오늘도 장사중 (10/25, 비즈파일럿 bizpilot.kr 최종안). docs/promo/bizpilot-room.md
 * - 탭: 💬 자유채팅(그대로) · 💸 남는 돈 계산 · 👥 직원·알바 · 📍 상권·자리 · 🎫 지원사업·마감 · 🏆 잘된 가게 (제목 앞 [계산]…)
 * - 매일 08:30·10:30·14:30·16:00·22:30 (KST) 비즈파일럿 글을 shop_queue 에서 꺼내 올린다 (src/lib/jobs/shopRoom.ts)
 * - 매일 07:30 방 전체 탭 맨 위 공지를 "오늘 올라올 글" 목록으로, 일요일 22:30 글 뒤에 "이번 주 모아 보기"
 * - 탭마다 맨 위 고정 글(자주 묻는 질문 정답)
 * 서버·테스트 공용 순수 함수.
 */
import { z } from "zod";
import { SHOP_HEADS, SHOP_ROOM } from "./heads";

export { SHOP_ROOM };
export const SHOP_AUTHOR = "비즈파일럿";
export const isShopRoom = (slug: string | null | undefined): boolean => slug === SHOP_ROOM;

/** 하루 다섯 칸 (KST). 점심(11~14시)·저녁(17~21시) 장사 시간은 피했다 */
export const SHOP_SLOTS = ["08:30", "10:30", "14:30", "16:00", "22:30"] as const;
/** 오늘 올라올 글 공지를 바꾸는 시각 (KST) */
export const NOTICE_AT = "07:30";

export type ShopHead = (typeof SHOP_HEADS)[number]["key"];
export const SHOP_HEAD_KEYS: readonly string[] = SHOP_HEADS.map((h) => h.key);
export const isShopHead = (v: string): v is ShopHead => SHOP_HEAD_KEYS.includes(v);
export const shopHeadLabel = (h: string): string => SHOP_HEADS.find((x) => x.key === h)?.label ?? h;

/** 방 전체 탭 고정 글 표시 */
export const PIN_ALL = "*";
/** 공지 글·주간 모아 보기의 seed_key */
export const NOTICE_SEED = `shoproom:notice`;
export const weekSeed = (sundayYmd: string) => `shoproom:week:${sundayYmd}`;

/** 이 목록에서 맨 위로 올릴 고정 글: 탭이면 그 말머리, 방 전체 탭이면 '*'. 이 방이 아니면 없음 */
export function pinnedTabFor(slug: string | undefined, f: { head?: string; type?: string; sourced?: boolean }): string | undefined {
  if (!isShopRoom(slug)) return undefined;
  if (f.head) return f.head;
  return !f.type && !f.sourced ? PIN_ALL : undefined;
}

/** 이 방 목록에서는 제목 앞 [계산] 같은 탭 표시를 뗀다 (카드에 탭 이름이 이미 보이는 셈이라) */
export const stripsHead = (slug: string | undefined): boolean => isShopRoom(slug);

export const SHOP_RULES = [
  "회원의 홍보 글·외부 링크 삭제",
  "실명 가게·건물주·직원 비난 삭제(동 이름까지만)",
  "세무·노무·법은 경험담으로, 확정은 전문가에게",
  "폐업·빚 고민에 비난 금지. 심하면 서민금융 1397, 자살예방상담 109 안내",
] as const;

const KST = 9 * 3600_000;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** KST 날짜 'YYYY-MM-DD' 와 시각 'HH:MM' */
export function kstParts(d: Date): { ymd: string; hm: string; dow: number } {
  const k = new Date(d.getTime() + KST);
  return { ymd: k.toISOString().slice(0, 10), hm: k.toISOString().slice(11, 16), dow: k.getUTCDay() };
}

/** 'YYYY-MM-DD' → '10/26(월)' */
export function mdLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})`;
}

/** 'YYYY-MM-DD' 에 n일 */
export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 공지가 보여 줄 날: 07:30 전에는 어제 공지를 그대로 둔다 */
export function noticeDay(now: Date): string {
  const { ymd, hm } = kstParts(now);
  return hm >= NOTICE_AT ? ymd : addDays(ymd, -1);
}

export type QueueLine = { publishAt: Date; head: string; title: string };

/** 제목 앞 [계산] 떼기 */
export const bareTitle = (t: string): string => t.replace(/^\[[^\]]{2,4}\]\s*/, "");

/** 오늘 올라올 글 공지 (제목·본문). items 는 그날 올릴 글(고정 글 제외) */
export function noticeText(day: string, items: readonly QueueLine[]): { title: string; body: string } {
  const rules = ["📌 방 규칙", ...SHOP_RULES.map((r, i) => `${i + 1}. ${r}`)].join("\n");
  const sorted = [...items].sort((a, b) => a.publishAt.getTime() - b.publishAt.getTime());
  if (!sorted.length) return { title: "📌 오늘도 장사중 방 규칙", body: rules };
  const lines = sorted.map((it) => `${kstParts(it.publishAt).hm} · ${shopHeadLabel(it.head)}\n${bareTitle(it.title)}`);
  return {
    title: `📅 오늘 올라올 글 ${sorted.length}개 · ${mdLabel(day)}`,
    body: `${lines.join("\n\n")}\n\n${rules}`,
  };
}

/** 이번 주(월~일) 모아 보기: 탭 순서대로 그 탭 글 제목 */
export function weekText(sundayYmd: string, items: readonly QueueLine[]): { title: string; body: string } | null {
  if (!items.length) return null;
  const monday = addDays(sundayYmd, -6);
  const blocks: string[] = [];
  for (const h of SHOP_HEADS) {
    const mine = items.filter((it) => it.head === h.key).sort((a, b) => a.publishAt.getTime() - b.publishAt.getTime());
    if (mine.length) blocks.push([h.label, ...mine.map((it) => `· ${bareTitle(it.title)}`)].join("\n"));
  }
  return { title: `🗓 이번 주 모아 보기 · ${mdLabel(monday)}~${mdLabel(sundayYmd)}`, body: blocks.join("\n\n") };
}

/** 주간 모아 보기를 올릴 때인지: 일요일 22:31 뒤 ~ 월요일 07:00 전. 올릴 주의 일요일 날짜 */
export function roundupSunday(now: Date): string | null {
  const { ymd, hm, dow } = kstParts(now);
  if (dow === 0 && hm >= "22:31") return ymd;
  if (dow === 1 && hm < "07:00") return addDays(ymd, -1);
  return null;
}

/** 'YYYY-MM-DD', 'HH:MM' → KST 시각 */
export const kstDate = (ymd: string, hm: string): Date => new Date(`${ymd}T${hm}:00+09:00`);

// ---------------------------------------------------------------------------
// 비즈파일럿 피드 (10/25 두 번째 안: 파일 전달 없이 노방장 서버가 10분마다 가져간다)
// ---------------------------------------------------------------------------

export const DEFAULT_FEED_URL = "https://bizpilot.kr/nobangjang/feed.json";
/** 피드를 읽는 간격 */
export const FEED_EVERY_MS = 10 * 60_000;
/** 이보다 늦은 글은 올리지 않고 건너뛴다 (밀린 글이 한꺼번에 올라가지 않게 — 비즈파일럿 요청 "하루") */
export const LATE_LIMIT_HOURS = 24;

const squash = (s: string) => s.replace(/[\s\p{Extended_Pictographic}️‍]/gu, "");
/** "💸 남는 돈 계산" → "계산" (💬 자유채팅·모르는 탭이면 null) */
export function tabKeyOf(label: string): ShopHead | null {
  const l = squash(label);
  if (!l) return null;
  return (SHOP_HEADS.find((h) => l.includes(squash(h.label)) || squash(h.label).includes(l))?.key as ShopHead | undefined) ?? null;
}

const isoKst = z.string().refine((v) => /[zZ]|[+-]\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "시간대가 붙은 시각");
export const feedSchema = z.object({
  nickname: z.string().trim().min(1).max(20).optional(),
  room: z.string().optional(),
  posts: z
    .array(
      z.object({
        id: z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{4}$/),
        at: isoKst,
        tab: z.string().min(1).max(40),
        title: z.string().trim().min(1).max(200),
        body: z.string().max(20_000).default(""),
        images: z.array(z.string().url().max(500)).max(6).default([]),
      }),
    )
    .max(500)
    .default([]),
  pinned: z
    .array(z.object({ tab: z.string().min(1).max(40), title: z.string().trim().min(1).max(200), body: z.string().max(20_000) }))
    .max(20)
    .default([]),
});
export type Feed = z.infer<typeof feedSchema>;

/** 사이트 규칙: em dash → 쉼표, "그림:" 줄 지우기, 빈 줄 정리 */
export function cleanText(s: string): string {
  return s
    .replace(/\r/g, "")
    .replace(/\s*[—―]\s*/g, ", ")
    .split("\n")
    .filter((l) => !/^\s*그림\s*:/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 피드 제목 → 저장할 제목: 앞에 탭 말머리 [계산] (이미 붙어 있으면 그대로), 끝 마침표 떼기 */
export function feedTitle(head: string, title: string): string {
  const t = cleanText(title).split("\n")[0]!.replace(/\.$/, "").trim();
  return (t.startsWith(`[${head}]`) ? t : `[${head}] ${t}`).slice(0, 120);
}

export type FeedItem = { key: string; publishAt: Date; head: ShopHead; title: string; body: string; imageUrls: string[]; pinned: boolean };

/**
 * 피드 → 넣을 칸들. 탭을 모르면 problems 에, 하루 넘게 지난 글은 건너뛴다(skipped).
 * 고정 글은 key "pin:계산", 시각은 지금.
 */
export function feedItems(feed: Feed, now: Date): { items: FeedItem[]; skipped: string[]; problems: string[] } {
  const items: FeedItem[] = [];
  const skipped: string[] = [];
  const problems: string[] = [];
  for (const p of feed.posts) {
    const head = tabKeyOf(p.tab);
    if (!head) {
      problems.push(`${p.id}: 모르는 탭 ${p.tab}`);
      continue;
    }
    const at = new Date(p.at);
    if (at.getTime() < now.getTime() - LATE_LIMIT_HOURS * 3600_000) {
      skipped.push(p.id);
      continue;
    }
    items.push({ key: p.id, publishAt: at, head, title: feedTitle(head, p.title), body: cleanText(p.body), imageUrls: p.images, pinned: false });
  }
  const seen = new Set<string>();
  for (const p of feed.pinned) {
    const head = tabKeyOf(p.tab);
    if (!head) {
      problems.push(`고정 글: 모르는 탭 ${p.tab}`);
      continue;
    }
    if (seen.has(head)) continue;
    seen.add(head);
    items.push({ key: `pin:${head}`, publishAt: now, head, title: feedTitle(head, p.title), body: cleanText(p.body), imageUrls: [], pinned: true });
  }
  return { items, skipped, problems };
}
