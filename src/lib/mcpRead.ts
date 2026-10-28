/**
 * 🔌 MCP 읽기 전용 도구 (10/24, 카카오 PlayMCP 등록용). 방 목록·행사 일정·정보 글 검색·1분 테스트.
 * 공개 사이트에 보이는 것만 — 제목·발췌·주소. 닉네임·fingerprint·IP 는 돌려주지 않는다.
 */
import { config } from "./config";
import { query } from "./db";
import { MARKET_ROOMS, type Market } from "./marketEvents";
import { listCategories } from "./repo/categories";
import { listPosts } from "./repo/posts";
import type { Category } from "./types";

export const FROM = "from=playmcp";
const escapeLike = (t: string) => t.replace(/[\\%_]/g, (m) => `\\${m}`);
const roomUrl = (slug: string) => `${config.siteUrl}/c/${encodeURIComponent(slug)}?${FROM}`;
const postUrl = (id: string) => `${config.siteUrl}/posts/${id}?${FROM}`;
const oneLine = (s: string, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return [...t].length > max ? `${[...t].slice(0, max - 1).join("")}…` : t;
};

/** limit: 기본 10, 최대 20 */
export const limitOf = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(20, Math.max(1, Math.floor(n))) : 10;
};
const text = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const LIMIT_SCHEMA = { type: "integer", minimum: 1, maximum: 20, default: 10, description: "결과 수 (기본 10, 최대 20)" };

/** 이름·slug 가 같으면 그 방, 아니면 이름·slug 에 들어 있는 첫 방 (숨긴 방 제외) */
async function findRoom(input: string): Promise<Category | null> {
  const q = input.toLowerCase().replace(/\s+/g, "");
  if (!q) return null;
  const rooms = await listCategories();
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return (
    rooms.find((r) => norm(r.slug) === q || norm(r.name) === q) ??
    rooms.find((r) => norm(r.name).includes(q) || norm(r.slug).includes(q)) ??
    null
  );
}

export type RoomItem = { name: string; description: string; post_count: number; url: string };

export async function listRoomsTool(args: Record<string, unknown>): Promise<{ rooms: RoomItem[]; total: number }> {
  const q = text(args.query).toLowerCase();
  const rooms = (await listCategories()).filter((r) => !q || r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q));
  return {
    total: rooms.length,
    rooms: rooms.slice(0, limitOf(args.limit)).map((r) => ({ name: r.name, description: oneLine(r.description, 80), post_count: r.post_count, url: roomUrl(r.slug) })),
  };
}

export type EventItem = { title: string; room: string; created_at: string; excerpt: string; url: string };
export type ScheduleItem = { title: string; room: string; starts_at: string; source_url: string; url: string };

/** 행사·할인: 제목이 [행사]·[혜택] 으로 시작하는 글 (방의 🎫 행사·할인 탭) + 투자방은 공식 일정(market_events) */
export async function searchEventsTool(args: Record<string, unknown>): Promise<{ events: EventItem[]; schedule?: ScheduleItem[]; note?: string }> {
  const limit = limitOf(args.limit);
  const roomIn = text(args.room);
  const keyword = text(args.keyword);
  const upcoming = args.upcoming_only === true || args.upcoming_only === "true";
  const room = roomIn ? await findRoom(roomIn) : null;
  if (roomIn && !room) return { events: [], note: `'${roomIn}' 방을 찾지 못했어요. list_rooms 로 방 이름을 확인해 주세요.` };

  const where = [
    "NOT p.is_blinded",
    "NOT p.is_suppressed",
    "NOT c.is_hidden",
    "(p.title LIKE '[행사]%' OR p.title LIKE '[혜택]%')",
  ];
  const vals: unknown[] = [];
  if (room) {
    vals.push(room.id);
    where.push(`p.category_id = $${vals.length}`);
  }
  if (keyword) {
    vals.push(`%${escapeLike(keyword)}%`);
    where.push(`(p.title ILIKE $${vals.length} OR p.body ILIKE $${vals.length})`);
  }
  // 글에는 행사 날짜 칸이 없어 "다가오는" = 최근 30일 안에 올라온 소식으로 본다
  if (upcoming) where.push("p.created_at > now() - interval '30 days'");
  vals.push(limit);
  const rows = await query<{ id: string; title: string; room: string; created_at: Date | string; excerpt: string }>(
    `SELECT p.id::text, p.title, c.name AS room, p.created_at, left(regexp_replace(p.body, '\\s+', ' ', 'g'), 220) AS excerpt
       FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.created_at DESC, p.id DESC LIMIT $${vals.length}`,
    vals,
  );
  const events = rows.map((r) => ({ title: r.title, room: r.room, created_at: new Date(r.created_at).toISOString(), excerpt: oneLine(r.excerpt, 200), url: postUrl(r.id) }));

  // 투자방(미국주식방·주식)은 공식 출처로 확인한 일정표가 따로 있다 — 앞으로의 일정만
  let schedule: ScheduleItem[] | undefined;
  const markets: readonly Market[] | undefined = room ? MARKET_ROOMS[room.slug] : undefined;
  if (room && markets) {
    const sv: unknown[] = [markets];
    let kw = "";
    if (keyword) {
      sv.push(`%${escapeLike(keyword)}%`);
      kw = ` AND title ILIKE $${sv.length}`;
    }
    sv.push(limit);
    const ev = await query<{ title: string; starts_at: Date | string; source_url: string }>(
      `SELECT title, starts_at, source_url FROM market_events WHERE market = ANY($1::text[]) AND starts_at >= now()${kw} ORDER BY starts_at, id LIMIT $${sv.length}`,
      sv,
    );
    schedule = ev.map((e) => ({ title: e.title, room: room.name, starts_at: new Date(e.starts_at).toISOString(), source_url: e.source_url, url: roomUrl(room.slug) }));
  }
  return { events, ...(schedule ? { schedule } : {}), ...(events.length || schedule?.length ? {} : { note: "조건에 맞는 행사·할인 소식이 아직 없어요." }) };
}

export type PostItem = { title: string; room: string; excerpt: string; url: string };

/** 정보 글 검색 — 사이트 검색(listPosts)과 같은 조건. 광고 의심·숨긴 방 제외, [행사]·[혜택] 은 제목에 검색어가 있을 때만 */
export async function searchPostsTool(args: Record<string, unknown>): Promise<{ posts: PostItem[]; note?: string }> {
  const q = text(args.query);
  if (!q) return { posts: [], note: "query 가 필요해요." };
  const limit = limitOf(args.limit);
  const roomIn = text(args.room);
  const room = roomIn ? await findRoom(roomIn) : null;
  if (roomIn && !room) return { posts: [], note: `'${roomIn}' 방을 찾지 못했어요. list_rooms 로 방 이름을 확인해 주세요.` };
  const r = await listPosts({ q, sort: "trust", type: "info", categoryId: room?.id, hideHiddenRooms: true, pageSize: Math.min(50, limit * 2 + 5), noCount: true });
  if (r.tooShort) return { posts: [], note: "검색어를 두 글자 이상으로 입력해 주세요." };
  const lower = q.toLowerCase();
  const posts = r.items
    .filter((p) => !p.is_suppressed)
    .filter((p) => !/^\[(행사|혜택)\]/.test(p.title) || p.title.toLowerCase().includes(lower))
    .slice(0, limit)
    .map((p) => ({ title: p.title, room: p.category.name, excerpt: oneLine(p.excerpt, 200), url: postUrl(p.id) }));
  return { posts, ...(posts.length ? {} : { note: "검색 결과가 없어요." }) };
}

export type TestItem = { name: string; description: string; url: string; room_url: string | null };

/** 1분 테스트 목록 (src/app/*-test). room: 관련 방 slug */
export const TESTS: { path: string; name: string; description: string; room: string | null }[] = [
  { path: "/ear-test", name: "황금귀 테스트", description: "원본과 MP3 압축본을 듣고 원본 고르기 (10문제)", room: "perfume-audio" },
  { path: "/hearing-test", name: "고음 청력 테스트", description: "8~20kHz, 내 귀는 몇 kHz까지 들릴까", room: "perfume-audio" },
  { path: "/typing-test", name: "한글 타자 테스트", description: "1분에 몇 타? 타수·정확도 측정", room: "keyboards" },
  { path: "/first-line-test", name: "첫 문장 테스트", description: "유명한 책 첫 문장만 보고 제목 맞히기", room: "읽는-책-제목을-교환해-보자" },
  { path: "/ai-test", name: "AI 판별 테스트", description: "진짜 시인의 문장과 AI 문장 골라내기", room: "ai-덕후방" },
  { path: "/debate-test", name: "토론 스타일 테스트", description: "논리파? 중재파? 승부사? 나의 토론 스타일", room: "ai-밸런스-토론방" },
  { path: "/run-test", name: "러너 타입 테스트", description: "새벽 혼런러? 기록 사냥꾼? 나의 러닝 타입", room: "러닝-덕후방" },
  { path: "/shoe-test", name: "신발러 타입 테스트", description: "데일리 컴포트파? 드로우 사냥꾼? 나의 신발 타입", room: "신발-덕후방" },
  { path: "/kbo-test", name: "야구 팬 타입 테스트", description: "직관 응원단? 기록 분석가? 나의 야구 팬 타입", room: "kbo-덕후방" },
  { path: "/fan-test", name: "축구 팬 타입 테스트", description: "직관파? 분석가? 나의 축구 팬 타입", room: "k리그-덕후방" },
  { path: "/parent-test", name: "육아 타입 테스트", description: "꼼꼼 정보러? 기록 장인? 나의 육아 스타일", room: "육아-덕후방" },
  { path: "/writer-test", name: "장르 작가 테스트", description: "판타지·현판·로판·무협… 나에게 맞는 웹소설 장르", room: "작가지망생방" },
  { path: "/vegan-test", name: "채식 타입 테스트", description: "플렉시테리언부터 비건까지, 나의 채식 타입", room: "비건-덕후방" },
  { path: "/yoga-test", name: "요가·필라테스 타입 테스트", description: "코어 집중러? 힐링 수련러? 나의 수련 타입", room: "요가-필라테스-덕후방" },
  { path: "/game-test", name: "게이머 타입 테스트", description: "랭크 올인파? 밤샘 스토리파? 나의 게임 타입", room: "게임-덕후방" },
  { path: "/drama-test", name: "드라마러 타입 테스트", description: "정주행파? 본방 사수파? 나의 드라마 타입", room: "드라마-덕후방" },
  { path: "/coffee-test", name: "커피러 타입 테스트", description: "아아 직진파? 핸드드립 탐험가? 나의 커피 타입", room: "커피-덕후방" },
  { path: "/anime-test", name: "덕질 타입 테스트", description: "굿즈 수집가? 정주행 시청파? 나의 애니·만화 덕질 타입", room: "애니-만화-덕후방" },
  { path: "/wine-test", name: "술 취향 테스트", description: "묵직 레드파? 스모키 피트파? 와인·위스키 취향 (만 19세 이상)", room: "와인-위스키-덕후방" },
  { path: "/dog-test", name: "견주 타입 테스트", description: "산책왕? 성분표 박사? 나의 견주 타입", room: "반려견-덕후방" },
  { path: "/ntrp-test", name: "NTRP 1분 자가진단", description: "질문 6개로 알아보는 내 테니스 수준 (재미용 추정)", room: "테니스-덕후방" },
  { path: "/viv-test", name: "비바리움러 타입 테스트", description: "레이아웃 장인? 관찰 기록파? 나의 비바리움 타입", room: "비바리움-덕후방" },
  { path: "/vivarium-test", name: "첫 생물 고르기 테스트", description: "우리 집에서 키울 수 있는 첫 비바리움 생물 찾기", room: "비바리움-덕후방" },
];

export async function listTestsTool(args: Record<string, unknown>): Promise<{ tests: TestItem[]; total: number }> {
  const q = text(args.query).toLowerCase();
  // 숨긴 방으로는 보내지 않는다
  const visible = new Set((await listCategories()).map((r) => r.slug));
  const list = TESTS.filter((t) => !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  return {
    total: list.length,
    tests: list.slice(0, limitOf(args.limit ?? 20)).map((t) => ({
      name: t.name,
      description: t.description,
      url: `${config.siteUrl}${t.path}?${FROM}`,
      room_url: t.room && visible.has(t.room) ? roomUrl(t.room) : null,
    })),
  };
}
