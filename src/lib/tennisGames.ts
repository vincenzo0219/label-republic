/**
 * 🎾 테니스방 게임 모집 (10/29 대표님 "카톡 단톡방의 지역별 시합 어딨어?").
 * 카톡 단톡방의 "10/31(토) 10-12시 용인베스트 실내 남복2 모집" 같은 한 줄을 지역·날짜·종목으로 걸러 보게 한다.
 * 연락처는 오픈채팅 링크·카톡 아이디만 받고(전화번호 X), 목록에는 넣지 않는다. 날짜가 지난 게임은 목록에서 빠진다.
 * 화면과 서버가 같이 쓰는 규칙만 여기 (DB 는 src/lib/repo/tennisGames.ts).
 */
import { z } from "zod";
import { REGIONS, SIDOS, addDays, districtsOf, dowOf, kstYmd } from "./instructorRoom";

export const TENNIS_ROOM = "테니스-덕후방";
export const GAMES_TAB = "games";
export const GAME_TYPES = ["남복", "여복", "혼복", "단식", "랠리"] as const;
export type GameType = (typeof GAME_TYPES)[number];
/** 며칠 뒤 게임까지 받는지 */
export const MAX_AHEAD_DAYS = 60;
export const GAME_GUIDE = "지역·날짜·종목으로 골라 보고, 참여 신청은 게임마다 💬 댓글로 받아요.";

const HHMM = /^\d{2}:\d{2}$/;
const PHONE = /(?:\+?82[-\s.]?)?0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

/** 공개 칸(코트·조건·비용·메모)에 전화번호·이메일이 있으면 그 이유 */
export function personalInfoIn(...texts: string[]): string | null {
  const t = texts.join("\n");
  if (PHONE.test(t)) return "전화번호는 적지 말아 주세요. 참여 신청은 💬 댓글로 받아요";
  if (EMAIL.test(t)) return "이메일은 적지 말아 주세요. 참여 신청은 💬 댓글로 받아요";
  return null;
}

/** 연락처: 오픈채팅 링크(https://open.kakao.com/...) 또는 카톡 아이디. 전화번호는 받지 않는다 */
export function contactProblem(c: string): string | null {
  const v = c.trim();
  if (/^https:\/\/open\.kakao\.com\/[\w/-]{2,120}$/.test(v)) return null;
  if (PHONE.test(v) || /\d{7,}/.test(v)) return "전화번호 대신 오픈채팅 링크나 카톡 아이디를 넣어 주세요";
  if (/^(?:카톡\s*(?:아이디|ID)?\s*[:：]?\s*)?[A-Za-z0-9._-]{4,30}$/i.test(v)) return null;
  return "오픈채팅 링크(https://open.kakao.com/…)나 카톡 아이디를 넣어 주세요";
}

export const gameInputSchema = z.object({
  nickname: z.string().trim().min(2).max(20),
  pw: z.string().regex(/^\d{4}$/),
  sido: z.string().refine((v) => SIDOS.includes(v), "시·도를 골라 주세요"),
  sigungu: z.string().trim().max(20).default(""),
  court: z.string().trim().min(2, "코트 이름을 적어 주세요").max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요"),
  start: z.string().regex(HHMM, "시작 시간을 골라 주세요"),
  end: z.string().regex(HHMM).or(z.literal("")).default(""),
  type: z.enum(GAME_TYPES),
  needM: z.number().int().min(0).max(8).default(0),
  needF: z.number().int().min(0).max(8).default(0),
  needAny: z.number().int().min(0).max(8).default(0),
  level: z.string().trim().max(40).default(""),
  cost: z.string().trim().max(40).default(""),
  notes: z.string().trim().max(300).default(""),
  // 10/29 대표님 "오픈채팅이랑 관계없이 만들어": 화면에는 연락처 칸이 없고 참여는 💬 댓글로. 예전 글·API 호환으로 칸만 남긴다
  contact: z.string().trim().max(160).default(""),
});
export type GameInputRaw = z.input<typeof gameInputSchema>;
export type GameInput = z.output<typeof gameInputSchema>;

/** 저장 전 마지막 확인 (화면에서도 같은 말로 보여 준다). 문제 없으면 null */
export function gameProblem(g: Omit<GameInput, "nickname" | "pw">, today: string): string | null {
  if (g.sigungu && !districtsOf(g.sido).includes(g.sigungu)) return "시·군·구를 다시 골라 주세요";
  if (g.date < today) return "지난 날짜예요";
  if (g.date > addDays(today, MAX_AHEAD_DAYS)) return `${MAX_AHEAD_DAYS}일 안의 게임만 올릴 수 있어요`;
  if (g.end && g.end <= g.start) return "끝나는 시간이 시작보다 늦어야 해요";
  if (g.needM + g.needF + g.needAny === 0) return "몇 명 모집하는지 적어 주세요";
  return (g.contact ? contactProblem(g.contact) : null) ?? personalInfoIn(g.court, g.level, g.cost, g.notes);
}

export const needLabel = (g: { needM: number; needF: number; needAny: number }): string =>
  [g.needM ? `남${g.needM}` : "", g.needF ? `여${g.needF}` : "", g.needAny ? `${g.needAny}명` : ""].filter(Boolean).join(" · ");

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export const dateLabel = (ymd: string, today: string): string => {
  const [, m, d] = ymd.split("-").map(Number);
  const rel = ymd === today ? "오늘 " : ymd === addDays(today, 1) ? "내일 " : "";
  return `${rel}${m}/${d}(${DOW[dowOf(ymd)]})`;
};
export const timeLabel = (start: string, end: string) => (end ? `${start}~${end}` : `${start}~`);

export type When = "today" | "tomorrow" | "weekend";
/** 날짜 거르기 범위 [from, to]. 주말은 다가오는 토·일 (일요일이면 오늘만) */
export function whenRange(when: When, today: string): [string, string] {
  if (when === "today") return [today, today];
  if (when === "tomorrow") return [addDays(today, 1), addDays(today, 1)];
  const dow = dowOf(today);
  if (dow === 0) return [today, today];
  const sat = addDays(today, 6 - dow);
  return [dow === 6 ? today : sat, addDays(sat, 1)];
}

// ---------------------------------------------------------------------------
// 📋 카톡 한 줄 붙여 넣기 → 칸 채우기 (확실한 것만. 못 찾은 칸은 비워 둔다)
// ---------------------------------------------------------------------------
export type ParsedGame = Partial<{ sido: string; sigungu: string; court: string; date: string; start: string; end: string; type: GameType; needM: number; needF: number; needAny: number; level: string; cost: string }>;

const pad = (n: number) => String(n).padStart(2, "0");

/** 월·일 → 오늘 기준 가장 가까운 앞날짜 (한 달 넘게 지난 날짜면 내년) */
function ymdOf(m: number, d: number, today: string): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const y = Number(today.slice(0, 4));
  let s = `${y}-${pad(m)}-${pad(d)}`;
  if (Number.isNaN(Date.parse(`${s}T00:00:00Z`)) || new Date(`${s}T00:00:00Z`).getUTCDate() !== d) return null;
  if (s < addDays(today, -30)) s = `${y + 1}-${pad(m)}-${pad(d)}`;
  return s;
}

type Needle = { sido: string; sigungu: string; word: string };
let NEEDLES: Needle[] | null = null;
/** 지역 단서: "관악구"처럼 겹치지 않는 구 이름, "용인"처럼 시·군 이름 앞부분 (시·도 이름과 겹치는 "광주" 같은 건 뺀다) */
function needles(): Needle[] {
  if (NEEDLES) return NEEDLES;
  const all = REGIONS.flatMap((r) => r.districts.map((d) => ({ sido: r.short, d })));
  const count = (w: string) => all.filter((x) => x.d === w || x.d.replace(/[시군]$/, "") === w).length;
  const out: Needle[] = [];
  for (const { sido, d } of all) {
    if (/구$/.test(d) && d.length >= 3 && count(d) === 1) out.push({ sido, sigungu: d, word: d });
    const stem = d.replace(/[시군]$/, "");
    if (/[시군]$/.test(d) && stem.length >= 2 && !SIDOS.includes(stem) && count(stem) === 1) out.push({ sido, sigungu: d, word: stem });
  }
  NEEDLES = out.sort((a, b) => b.word.length - a.word.length);
  return NEEDLES;
}

export function parseKakaoGame(raw: string, now = new Date()): ParsedGame {
  const today = kstYmd(now);
  // 톡게시판 머리("톡게시판 '일정':")·대괄호 닉네임·마감 표시는 빼고 본다
  let t = raw
    .replace(/\[[^\]]{0,40}\]\s*\[[^\]]{0,12}\]/g, " ")
    .replace(/톡게시판\s*'[^']{0,12}'\s*:?/g, " ")
    .replace(/\(?마감\)?|급\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const out: ParsedGame = {};
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = t.match(re);
    if (m) t = t.replace(m[0], " ");
    return m;
  };

  // 날짜: 10/31(토) · 10.28(수) · 10월 31일 · 29(목) · 오늘·금일 · 내일
  const md = take(/(\d{1,2})\s*(?:[/.]|월\s*)\s*(\d{1,2})\s*일?\s*(?:\(\s*[월화수목금토일]\s*\)|[월화수목금토일]요일|[월화수목금토일](?![가-힣]))?/);
  if (md) out.date = ymdOf(Number(md[1]), Number(md[2]), today) ?? undefined;
  else {
    const d = take(/(?<!\d)(\d{1,2})\s*일?\s*\(\s*[월화수목금토일]\s*\)/);
    if (d) {
      const day = Number(d[1]);
      const [y, m] = today.split("-").map(Number) as [number, number];
      const here = ymdOf(m, day, today);
      out.date = here && here >= today ? here : (ymdOf(m === 12 ? 1 : m + 1, day, m === 12 ? `${y + 1}-01-01` : today) ?? undefined);
    } else if (take(/금일|오늘/)) out.date = today;
    else if (take(/내일/)) out.date = addDays(today, 1);
  }

  // 시간: 10-12시 · 08시~10시 · 오후8~10시 · 20시~21시반 · 19-21
  const tm = take(/(오전|오후)?\s*(\d{1,2})(?::(\d{2}))?\s*시?\s*[-~]\s*(오전|오후)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:시\s*(반)?)?(?!\s*[년y])/);
  if (tm) {
    let s = Number(tm[2]);
    let e = Number(tm[5]);
    if (tm[1] === "오후" && s < 12) s += 12;
    if ((tm[4] === "오후" || (tm[1] === "오후" && !tm[4])) && e < 12) e += 12;
    if (e <= s && e + 12 > s && e + 12 <= 24) e += 12;
    const em = tm[7] ? "30" : (tm[6] ?? "00");
    if (s <= 23 && e <= 24 && e > s) {
      out.start = `${pad(s)}:${tm[3] ?? "00"}`;
      out.end = `${pad(e === 24 ? 23 : e)}:${e === 24 ? "59" : em}`;
    }
  }

  // 종목
  const ty = t.match(/남복|여복|혼복|혼합\s*복식|남자\s*복식|여자\s*복식|단식|랠리/);
  if (ty) out.type = (/혼/.test(ty[0]) ? "혼복" : /남/.test(ty[0]) ? "남복" : /여/.test(ty[0]) ? "여복" : ty[0]) as GameType;

  // 인원: 남복2 · 남2 · 여1모집 · 남자 3명 · 3명 모집
  const typeNum = take(/(남|여)복\s*(\d)\s*(?:명|분)?(?!\s*[년y])/);
  if (typeNum) out[typeNum[1] === "남" ? "needM" : "needF"] = Number(typeNum[2]);
  for (const [k, re] of [["needM", /남(?:자|성)?\s*(\d)\s*(?:명|분)?(?!\s*[년y])/], ["needF", /여(?:자|성)?\s*(\d)\s*(?:명|분)?(?!\s*[년y])/]] as const) {
    const m = take(re);
    if (m && out[k] === undefined) out[k] = Number(m[1]);
  }
  if (out.needM === undefined && out.needF === undefined) {
    const n = take(/(\d|한|두|세|네)\s*(?:명|분|인)/);
    if (n) {
      const v = /\d/.test(n[1]!) ? Number(n[1]) : "한두세네".indexOf(n[1]!) + 1;
      if (out.type === "남복") out.needM = v;
      else if (out.type === "여복") out.needF = v;
      else out.needAny = v;
    }
  }

  // 조건: 구력 3년 이상 · 3y이상 · 2년이상 · NTRP 3.0+ · 게임원활
  const lv: string[] = [];
  const ntrp = take(/NTRP\s*(\d\.\d)\s*\+?/i);
  if (ntrp) lv.push(`NTRP ${ntrp[1]}+`);
  const yr = take(/(?:구력\s*)?(\d{1,2})\s*(?:년|y|Y)\s*(?:차\s*)?(이상|↑)?/);
  if (yr) lv.push(`구력 ${yr[1]}년${yr[2] ? " 이상" : ""}`);
  if (take(/게임\s*원활/)) lv.push("게임 원활");
  if (lv.length) out.level = lv.join(" · ");

  const cost = take(/(?:코트비|캔볼|참가비)\s*[^\s,]{0,12}(?:\s*원)?/);
  if (cost) out.cost = cost[0].trim().slice(0, 40);

  // 지역
  const sidoWord = SIDOS.find((s) => s.length >= 2 && new RegExp(`${s}(?!시청)`).test(raw));
  const nd = needles().find((n) => raw.includes(n.word));
  if (nd) {
    out.sido = nd.sido;
    out.sigungu = nd.sigungu;
  } else if (sidoWord) out.sido = sidoWord;

  // 코트: 남은 말에서 모집·인사 표현을 빼고 앞 두세 마디
  const court = t
    .replace(/남복|여복|혼복|혼합\s*복식|단식|랠리|남자|여자|모집(?:합니다|해요|중)?|합니다|구합니다|게스트|부탁드려요|타방\s*동시|코트\s*양도|자리\s*양도|[!~.,()@/🥎🎾]|\s-\s/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !/^\d+$/.test(w) && !/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(w))
    .slice(0, 3)
    .join(" ");
  if (court.length >= 2) out.court = court.slice(0, 40);
  return out;
}
