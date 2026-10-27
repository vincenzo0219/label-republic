/**
 * 방 안의 작은 방 (Sprint 86) — 네이버 카페 말머리처럼 제목 앞 "[자랑]" 으로 나눈다. 따로 저장하지 않고 제목으로 거른다.
 * 모든 방: 자랑·행사·혜택. 방마다 더 있을 수 있다 (책 덕후방: 같이 읽기·밑줄, Sprint 96).
 * 혜택(10/23 사용자 미션 "정보·재미·실리를 어떤 커뮤니티보다 잘하자"): 무료 행사·할인·응모·티켓 오픈·굿즈 드롭
 */
export const HEADS = [
  { key: "자랑", label: "📸 자랑" },
  { key: "행사", label: "🎫 행사" },
  { key: "혜택", label: "🎁 혜택" },
] as const;

const BOOK_HEADS = [
  { key: "같이읽기", label: "📖 같이 읽기" },
  { key: "밑줄", label: "🔖 밑줄" },
  { key: "추천", label: "📚 추천" },
] as const;

/** 🏪 오늘도 장사중 (10/25, 비즈파일럿 운영): 탭 다섯 개, 이 순서. 제목 앞 [계산]·[직원]… 로 나눈다 (src/lib/shopRoom.ts) */
export const SHOP_HEADS = [
  { key: "계산", label: "💸 남는 돈 계산" },
  { key: "직원", label: "👥 직원·알바" },
  { key: "상권", label: "📍 상권·자리" },
  { key: "지원", label: "🎫 지원사업·마감" },
  { key: "가게", label: "🏆 잘된 가게" },
] as const;

/** 🧘 요가·필라테스 강사방 (10/25): 📋 대강 · 💼 구인구직(방 전용 화면) · 💬 채팅 다음 탭 */
const INSTRUCTOR_HEADS = [{ key: "수업팁", label: "🧘 수업 팁" }] as const;

/** 💌 미혼남녀 만남 행사 (10/27 대표님): 💌 만남 행사 · 💬 채팅 다음 탭. 행사는 만남 행사 탭과 겹쳐서, 자랑은 외모·연락처로 흐르기 쉬워서 뺀다 */
const SINGLES_HEADS = [
  { key: "꿀팁", label: "📋 신청 꿀팁" },
  { key: "참가후기", label: "🗣️ 후기·질문" },
] as const;

export const ALL_HEADS = [...BOOK_HEADS, ...HEADS, ...SHOP_HEADS, ...INSTRUCTOR_HEADS, ...SINGLES_HEADS] as const;

export type Head = (typeof ALL_HEADS)[number]["key"];

const BOOK = "읽는-책-제목을-교환해-보자";
export const BOOK_ROOM = BOOK;
/** 🏪 오늘도 장사중 주소 (10/25). 이름이 바뀌어도 주소는 그대로 */
export const SHOP_ROOM = "오늘도-장사중";
/** 🧘 요가·필라테스 강사방 주소 (10/25, src/lib/instructorRoom.ts 와 같은 값) */
const INSTRUCTOR = "요가-필라테스-강사방";
/** 💌 미혼남녀 만남 행사 주소 (src/lib/singlesEvents.ts SINGLES_ROOM 과 같은 값) */
const SINGLES = "미혼남녀-만남-행사";

/** 투자방 (10/24): 말머리(제목 앞 [행사]·[자랑]·[혜택])는 그대로, 탭 이름만 방에 맞게 */
const SCHEDULE = { key: "행사", label: "📅 일정" } as const;
const JOURNAL = { key: "자랑", label: "📒 매매일지" } as const;

/** 방 전용 말머리가 있는 방은 그것만 쓴다 (책 덕후방: 자랑은 밑줄로, 정모는 같이 읽기로 합침 — 10/21 단순화) */
const ROOM_HEADS: Record<string, readonly { key: Head; label: string }[]> = {
  [BOOK]: [...BOOK_HEADS, HEADS[1], HEADS[2]],
  미국주식방: [SCHEDULE, JOURNAL],
  주식: [SCHEDULE, JOURNAL],
  "적립식-투자방": [{ key: "자랑", label: "📒 적립 인증" }, HEADS[2]],
  // 이용자가 만든 식단방 (10/24): 📸 자랑 탭만 "📸 식단 인증" 으로, 나머지는 그대로
  "다이어트-식단-함께해요": [{ key: "자랑", label: "📸 식단 인증" }, HEADS[1], HEADS[2]],
  [SHOP_ROOM]: SHOP_HEADS,
  // 10/25 대표님: 강사방에도 행사·할인 → 워크숍·자격과정·박람회(🎫), 강사 할인·무료 세미나(🎁)
  [INSTRUCTOR]: [...INSTRUCTOR_HEADS, { key: "행사", label: "🎫 행사·할인" }, HEADS[2]],
  [SINGLES]: SINGLES_HEADS,
};
/** 방 전용 이름을 붙인 말머리는 탭에서도 그 이름 (공용 "🎫 행사·할인" 으로 바꾸지 않음) */
const ROOM_LABELED = new Set(["미국주식방", "주식", "적립식-투자방", SHOP_ROOM, INSTRUCTOR, SINGLES]);

/** 방 탭 줄 끝에 붙는 다른 화면 링크 (책 덕후방 물어보기는 10/23 📚 추천 탭 안으로 합침) */
export const ROOM_TAB_LINKS: Record<string, { href: string; label: string }[]> = {
  // 10/26: 사진 2장 자세 체크 (브라우저 안에서만 분석, src/lib/posture.ts)
  [INSTRUCTOR]: [{ href: "/posture-check", label: "📸 자세 체크" }],
};

/** 💬 채팅 바로 뒤에 붙는 방 전용 탭 (?tab=키, 글 목록 대신 그 화면) — 육아방 📍동네 체험 (10/24) */
export const ROOM_CHAT_TABS: Record<string, { key: string; label: string }[]> = {
  "육아-덕후방": [{ key: "near", label: "📍동네 체험" }],
  // 강사방 (10/26): 📋 대강 · 💼 구인구직 두 탭. 기본 탭이 있는 방은 이 탭들이 💬 채팅 앞에 온다
  [INSTRUCTOR]: [
    { key: "gigs", label: "📋 대강" },
    { key: "jobs", label: "💼 구인구직" },
  ],
  // 🙋 1대1 레슨 구해요 (10/26, 수강생 쪽. 강사 쪽은 강사방 💼 구인구직의 "1대1 레슨 가능")
  "요가-필라테스-덕후방": [{ key: "lesson", label: "🙋 1대1 레슨 구해요" }],
  // 💌 만남 행사 (10/26): 행사 카드·나 신청 가능?·알림은 이 탭, 글·💬 채팅은 다른 방처럼 (098)
  [SINGLES]: [{ key: "meet", label: "💌 만남 행사" }],
};
/** 탭 없이 들어오면 이 탭 (강사방: 📋 대강, 💌 만남 행사 방: 💌 만남 행사). 이런 방의 "전체" 는 ?tab=all */
export const ROOM_DEFAULT_TAB: Record<string, string> = { [INSTRUCTOR]: "gigs", [SINGLES]: "meet" };
export const ALL_TAB = "all";
export const roomTabOf = (slug: string, tab: string | undefined) => (tab ? ROOM_CHAT_TABS[slug]?.find((t) => t.key === tab) : undefined);
/** 💬 채팅 앞·뒤에 놓이는 방 전용 탭. 기본 탭이 있는 방(강사방)은 전부 채팅 앞(기본 탭이 맨 앞), 나머지 방은 채팅 뒤 */
export function roomTabsAround(slug: string): { before: { key: string; label: string }[]; after: { key: string; label: string }[] } {
  const tabs = ROOM_CHAT_TABS[slug] ?? [];
  const def = ROOM_DEFAULT_TAB[slug];
  if (!def) return { before: [], after: tabs };
  return { before: [...tabs.filter((t) => t.key === def), ...tabs.filter((t) => t.key !== def)], after: [] };
}

/** 📋 정보 탭을 따로 두지 않는 방 (전체 탭에만 보인다) */
export const NO_INFO_TAB = new Set([BOOK, SHOP_ROOM, INSTRUCTOR, SINGLES]);


/** 이 방에서 보이는 말머리 (방 전용이 앞) — 글쓰기에서 고르는 목록 */
export const headsFor = (slug: string | undefined): { key: Head; label: string }[] => [...((slug && ROOM_HEADS[slug]) || HEADS)];

/** 탭 하나에 다른 말머리 글도 함께 보이게 (10/23 사용자 "핫딜·할인은 모든 행사방에 넣어") */
const TAB_INCLUDES: Partial<Record<Head, Head[]>> = { 행사: ["혜택"] };
const TAB_LABELS: Partial<Record<Head, string>> = { 행사: "🎫 행사·할인" };

/** 방 탭 줄에 보이는 말머리 — 다른 탭에 합쳐진 말머리(혜택)는 따로 탭을 두지 않는다 */
export const tabHeadsFor = (slug: string | undefined): { key: Head; label: string }[] => {
  const heads = headsFor(slug);
  const keys = new Set(heads.map((h) => h.key));
  // 합쳐질 탭(행사)이 이 방에 있을 때만 따로 두지 않는다 (적립식 투자방은 🎁 혜택만 있음)
  const merged = new Set((Object.entries(TAB_INCLUDES) as [Head, Head[]][]).filter(([k]) => keys.has(k)).flatMap(([, v]) => v));
  const own = !!slug && ROOM_LABELED.has(slug);
  return heads.filter((h) => !merged.has(h.key)).map((h) => ({ ...h, label: own ? h.label : (TAB_LABELS[h.key] ?? h.label) }));
};

/** 이 탭에 보이는 말머리들 (자기 자신 + 합쳐진 것) */
export const tabMembers = (h: Head): Head[] => [h, ...(TAB_INCLUDES[h] ?? [])];

/** 말머리를 고르면 본문 칸 예시도 바꾼다. 자랑은 물건보다 경험 쪽으로 (물건 자랑도 환영) */
export const HEAD_HINTS: Partial<Record<Head, string>> = {
  자랑: "물건도 경험도 다 좋아요.\n예) 오늘 다녀온 직관 · 우리 개 산책 코스 · 이번 달 읽은 책 · 처음 산 LP",
  행사: "언제 · 어디서 · 무엇을, 그리고 공식 안내 링크를 남겨 주세요.",
  혜택: "무엇을 · 언제까지 · 어떻게 받는지, 그리고 공식 안내 링크를 남겨 주세요.",
  같이읽기: "같이 읽을 책 · 어디까지 읽었는지 · 모임 날짜",
  밑줄: "좋았던 문장 한 줄과 책 제목 (사진도 좋아요)",
  추천: "이런 상황엔 이 책 · 같은 주제 다른 관점 두 권 · 신간 · 명저",
  계산: "어떤 숫자가 바뀌었는지 · 한 달에 얼마 덜(더) 남는지",
  직원: "몇 명 · 몇 시간 · 한 달 인건비",
  상권: "동 이름까지만 · 층 · 전에 있던 가게",
  지원: "사업 이름 · 신청 마감일 · 공식 공고 주소",
  가게: "어떤 가게 · 무엇이 달랐는지 · 출처",
  수업팁: "어떤 수업 · 무엇을 바꿨는지 · 회원 반응",
  꿀팁: "어떤 서류·제도·요령인지 · 공식 안내 링크",
  참가후기: "어떤 행사 · 언제 · 좋았던 점·아쉬운 점 (연락처·실명·사진 속 얼굴은 빼고)",
};

/** 투자방 말머리 예시 (10/24) — 짧게 */
const ROOM_HINTS: Record<string, Partial<Record<Head, string>>> = {
  미국주식방: { 행사: "날짜 · 일정 · 공식 링크", 자랑: "날짜 · 산 것·판 것 · 이유 한 줄" },
  주식: { 행사: "날짜 · 일정 · 공식 링크", 자랑: "날짜 · 산 것·판 것 · 이유 한 줄" },
  "적립식-투자방": { 자랑: "몇 달째 · 무엇을", 혜택: "무엇을 · 언제까지 · 공식 링크" },
  "다이어트-식단-함께해요": { 자랑: "오늘 먹은 것 · 사진 한 장" },
};
export const headHint = (h: Head, slug?: string): string | undefined => (slug && ROOM_HINTS[slug]?.[h]) || HEAD_HINTS[h];

export const parseHead = (v: string | undefined): Head | undefined => ALL_HEADS.find((h) => h.key === v)?.key;

export const HEAD_PREFIX = /^\[([^\]]{2,4})\]\s*/;

export const headOf = (title: string): Head | undefined => parseHead(HEAD_PREFIX.exec(title)?.[1]);

export const headLabel = (h: Head, slug?: string) => (slug && ROOM_HEADS[slug]?.find((x) => x.key === h)?.label) || ALL_HEADS.find((x) => x.key === h)!.label;

/** 제목의 말머리를 바꾼다 (같은 걸 다시 누르면 뗀다) */
export function withHead(title: string, head: Head): string {
  const cur = headOf(title);
  const bare = cur ? title.slice(cur.length + 2).trimStart() : title;
  return cur === head ? bare : `[${head}] ${bare}`;
}
