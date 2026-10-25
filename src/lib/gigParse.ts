/**
 * 📋 대강·구인 "카톡 글 붙여넣기" (10/25). 카톡 대강방 글(느슨한 양식)을 읽어 칸을 채운다.
 * 정규식·어림 규칙이라 틀릴 수 있다: 채운 칸은 글쓴이가 확인하고 올린다. 서버·클라이언트 공용 순수 함수.
 *
 * 읽는 것: 업체명 · 주소/역(→ 시·도 + 시·군·구) · 날짜(10/27, 10월27일, 26.10.20, 27일, 오늘·내일) · 요일(월수금, 화·목, 매주 목요일)
 *        · 시간(18:40, 오후 7시, 7,8,9시, 18.19.20.21) · 수업 종류·기구 · 페이(3만, 3.5, 35,000원, 타임당) · 3.3% 공제 · 입금일
 *        · 연락처(휴대전화·이메일·카톡 아이디/오픈채팅) · 요청사항(지각·노쇼…)
 */
import { CLASS_TYPES, EQUIPMENT, REGIONS, addDays, dowOf, kstYmd, type ClassType, type GigKind } from "./instructorRoom";
import { stationRegion } from "./gigStations";

export type GigDraft = {
  kind: GigKind | null;
  studio: string;
  sido: string;
  sigungu: string;
  station: string;
  address: string;
  dates: string[];
  weekdays: number[];
  times: string[];
  classType: ClassType | null;
  equipment: string[];
  pay: number | null;
  tax: boolean | null;
  payday: string;
  contact: string;
  notes: string;
  /** 칸을 몇 개나 채웠는지 (화면에 "7칸 채움") */
  filled: number;
};

const WD = "일월화수목금토";

// ---------------------------------------------------------------------------
// 줄 정리: 카톡 내보내기 머리([닉네임] [오후 3:16]), 앞 기호·이모지
// ---------------------------------------------------------------------------
const KAKAO_HEAD = /^\[[^\]]{1,40}\]\s*\[(?:오전|오후)\s*\d{1,2}:\d{2}\]\s*/;
const BULLET = /^[\s\-–•·■□▪▶►>*✔✓✅☑⭐★☆♥❤️💗🩷🤍💰💵💸📍📌📅🗓️⏰⏱🕐📞📱☎📧📩✉🧘‍♀️🩰👥🔥✨📢💎🍀🌿🙏🏻🙇‍]+/u;

function cleanLines(raw: string): string[] {
  return raw
    .normalize("NFC")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(KAKAO_HEAD, "").replace(BULLET, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** "라벨 : 값" 줄 (라벨 뒤 : ： | -) */
const LABEL = /^\[?\s*([가-힣A-Za-z0-9/()&·. ]{1,16}?)\s*\]?\s*[:：|]\s*(.*)$/;

type Field = "studio" | "where" | "date" | "time" | "pay" | "contact" | "class" | "payday" | "tax" | "note";
const FIELD_RES: [Field, RegExp][] = [
  ["tax", /세금|공제|3\.3/],
  ["payday", /입금|지급일|정산/],
  ["studio", /업체|센터명|상호|스튜디오명|지점|근무처/],
  ["where", /주소|장소|위치|근무지|지역|근무\s*장소|센터\s*위치|오시는/],
  ["date", /날짜|기간|일시|일자|요일|근무\s*요일|일정|대강일/],
  ["time", /시간|타임|수업\s*시간|근무\s*시간/],
  ["pay", /페이|급여|수업료|강사료|타임비|대강비|시급|보수|금액/],
  ["contact", /연락|문의|전화|카톡|이메일|메일|지원\s*방법|접수/],
  ["class", /수업|프로그램|모집\s*분야|분야|기구|종목|과목|담당/],
  ["note", /요청|특이|참고|기타|우대|자격|필수/],
];

const fieldOf = (key: string): Field | undefined => FIELD_RES.find(([, re]) => re.test(key))?.[0];
/** 라벨만 있는 줄 ("📍 센터 위치", "⏰ 근무 시간") — 값은 다음 줄에 */
const headerField = (l: string): Field | undefined => (l.length <= 12 && !/\d/.test(l) && !LABEL.test(l) ? fieldOf(l.replace(/[\[\]]/g, "")) : undefined);

function labeled(lines: string[]): Map<Field, string[]> {
  const out = new Map<Field, string[]>();
  const push = (f: Field, v: string) => out.set(f, [...(out.get(f) ?? []), v]);
  let cur: Field | undefined;
  let carry = 0;
  for (const l of lines) {
    const m = LABEL.exec(l);
    const f = m ? fieldOf(m[1]!.trim()) : undefined;
    if (m && f) {
      // "사용기구&수업내용" 처럼 둘이 붙은 라벨은 앞의 것 (class)
      push(f, m[2]!.trim() || m[1]!.trim());
      cur = f;
      carry = 2;
      continue;
    }
    const h = headerField(l);
    if (h) {
      cur = h;
      carry = 3;
      continue;
    }
    // 라벨 다음의 짧은 줄은 같은 칸 (날짜 줄 다음 "29일 20시,21시")
    if (cur && carry > 0 && !m && l.length <= 60) {
      push(cur, l);
      carry--;
    } else cur = undefined;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 연락처
// ---------------------------------------------------------------------------
const PHONE = /(?<!\d)(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/g;
const LANDLINE = /(?<!\d)(0(?:2|[3-6][1-5]|70))[-.)\s]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/g;
const EMAIL = /(?<![\w.+-])[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+/g;
const OPENCHAT = /https?:\/\/open\.kakao\.com\/[\w/]+/g;
const KAKAO_ID = /(?:카톡|카카오톡|카카오)\s*(?:id|아이디|ID)\s*[:：]?\s*([A-Za-z0-9_.-]{3,30})/g;

function contacts(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PHONE)) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of text.matchAll(LANDLINE)) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of text.matchAll(EMAIL)) out.push(m[0]);
  for (const m of text.matchAll(OPENCHAT)) out.push(m[0]);
  for (const m of text.matchAll(KAKAO_ID)) out.push(`카톡 ${m[1]}`);
  return [...new Set(out)];
}

const stripContacts = (s: string) => s.replace(PHONE, " ").replace(LANDLINE, " ").replace(EMAIL, " ").replace(OPENCHAT, " ");

// ---------------------------------------------------------------------------
// 지역
// ---------------------------------------------------------------------------
const SIDO_NAMES: [RegExp, string][] = [
  [/서울(?:특별시|시)?/, "서울"], [/부산(?:광역시|시)?(?!진)/, "부산"], [/대구(?:광역시|시)?/, "대구"], [/인천(?:광역시|시)?/, "인천"],
  [/대전(?:광역시|시)?/, "대전"], [/울산(?:광역시|시)?/, "울산"], [/세종(?:특별자치시|시)?/, "세종"], [/경기(?:도)?(?![가-힣]*장)/, "경기"],
  [/강원(?:특별자치도|도)?/, "강원"], [/충청북도|충북/, "충북"], [/충청남도|충남(?!대)/, "충남"], [/전라북도|전북(?:특별자치도)?/, "전북"],
  [/전라남도|전남(?!대)/, "전남"], [/경상북도|경북(?!대)/, "경북"], [/경상남도|경남(?!대)/, "경남"], [/제주(?:특별자치도|도)?/, "제주"],
];

/** 단어로도 흔한 시·군·구 앞부분은 "○○구/시/군" 으로 쓴 것만 (동작=움직임, 수영, 연수, 예산…) */
const RISKY_STEMS = new Set(
  "동작 수영 연수 남동 금정 고성 안성 광주 수성 유성 광산 기장 사상 강화 보은 영동 음성 공주 부여 예산 완주 장수 영광 진도 경주 상주 영양 고령 동해 인제 중앙 서구 북구 남구 동구 중구 영도 구리 화성 청도 성주 진주 광양 양산 하동 김천 구미 문경 강진".split(" "),
);
type DHit = { sido: string; sigungu: string; at: number };

function hangulAt(s: string, i: number) {
  return /[가-힣]/.test(s[i] ?? "");
}

function findDistricts(text: string): DHit[] {
  const hits: DHit[] = [];
  for (const r of REGIONS) {
    for (const d of r.districts) {
      // 전체 이름 (마포구·성남시): 뒤에 한글이 바로 붙으면 다른 낱말 (동구릉, 하남시청)
      let i = text.indexOf(d);
      while (i >= 0) {
        if (!hangulAt(text, i + d.length) || /[동읍면로길]/.test(text[i + d.length] ?? "")) {
          hits.push({ sido: r.short, sigungu: d, at: i });
          break;
        }
        i = text.indexOf(d, i + 1);
      }
      // 앞부분만 (마포, 안양): 두 글자 이상, 흔한 낱말이 아닐 때, 앞에 한글이 붙지 않고 뒤가 띄어쓰기·기호·시/구/역/동
      const stem = d.slice(0, -1);
      if (stem.length < 2 || RISKY_STEMS.has(stem)) continue;
      const re = new RegExp(`(?<![가-힣])${stem}(?=$|[^가-힣]|[시구군역동점])`, "g");
      const m = re.exec(text);
      if (m) hits.push({ sido: r.short, sigungu: d, at: m.index });
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}

function findSido(text: string): { sido: string; at: number } | null {
  let best: { sido: string; at: number } | null = null;
  for (const [re, sido] of SIDO_NAMES) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { sido, at: m.index };
  }
  return best;
}

const STATION = /([가-힣A-Za-z0-9]{2,12})역(?=$|[^가-힣]|근처|인근|도보|앞|에서|부근|사거리|출구|바로|점|역세권)/g;
const STATION_STOP = /^(?:지|영|구|전|무|해당|각|이|그|저|인근)$|지$|영$|구$/;

function findStation(text: string): string {
  for (const m of text.matchAll(STATION)) {
    let name = m[1]!;
    // "8호선수진" 같은 앞붙이 떼기
    name = name.replace(/^\d+호선/, "");
    if (name.length < 2 || STATION_STOP.test(name)) continue;
    // 긴 덩어리면 표에 있는 뒷부분 (예: 영등포구청 → 영등포구청, 서울대입구 그대로)
    for (let k = 0; k < name.length - 1; k++) if (stationRegion(name.slice(k))) return name.slice(k);
    if (name.length <= 8) return name;
  }
  return "";
}

function region(priority: string, all: string, head: string): { sido: string; sigungu: string; station: string } {
  const station = findStation(priority) || findStation(all);
  for (const text of [priority, all]) {
    if (!text) continue;
    const s = findSido(text);
    const ds = findDistricts(text);
    // "경기 광주" 는 경기도 광주시, "광주" 만이면 광주광역시
    if (s?.sido === "경기" && /광주/.test(text)) return { sido: "경기", sigungu: "광주시", station };
    if (s) {
      const inSido = ds.find((d) => d.sido === s.sido);
      if (inSido) return { sido: s.sido, sigungu: inSido.sigungu, station };
    }
    if (ds.length) {
      // 같은 이름(중구·강서구…)이 여러 시·도에 있으면 서울부터 (REGIONS 순서)
      const first = ds[0]!;
      const same = ds.filter((d) => d.sigungu === first.sigungu);
      const pick = s ? (same.find((d) => d.sido === s.sido) ?? first) : first;
      return { sido: pick.sido, sigungu: pick.sigungu, station };
    }
    const st = station ? stationRegion(station) : null;
    if (st) return { ...st, station };
    if (s) return { sido: s.sido, sigungu: "", station };
  }
  const st = station ? stationRegion(station) : null;
  if (st) return { ...st, station };
  // "사당 포레스트필라테스" 처럼 '역' 없이 쓴 역 이름 (주소 줄·첫 줄만, 흔한 낱말은 빼고)
  for (const tok of head.split(/[^가-힣]+/)) {
    if (tok.length < 2 || STATION_WORDS.has(tok)) continue;
    const hit = stationRegion(tok);
    if (hit) return { ...hit, station };
  }
  return { sido: "", sigungu: "", station };
}

const STATION_WORDS = new Set("장기 대화 야당 상무 첨단 황금 상인 다산 중앙 시청 신정 송정 삼동 도담 나성 제주 오산 이천 평택 운정 금촌 사우 동천 상동 중동 마두 백석 대곡 탄현 풍산 수완 용문 구암 노은 감삼 두류 월배 달동 삼산 두정 불당 배방 탕정 화정 서면 부전 수영 광안 동래 명륜 사직 대연 중앙로 범어 만촌 반월당 정부청사 연수 논현 구월 계산 가정 주안 도화 동춘 동막 갈산 부개 임학 검암 석남 완정".split(" "));

// ---------------------------------------------------------------------------
// 날짜·요일
// ---------------------------------------------------------------------------
function ymdOf(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(`${s}T00:00:00Z`);
  return t.getUTCMonth() + 1 === m ? s : null;
}

/** 연도 없는 날짜: 오늘보다 두 달 넘게 지났으면 내년 */
function inferYear(m: number, d: number, today: string): string | null {
  const y = Number(today.slice(0, 4));
  const s = ymdOf(y, m, d);
  if (!s) return null;
  return s < addDays(today, -60) ? ymdOf(y + 1, m, d) : s;
}

function findDates(text: string, dateLines: string, today: string): string[] {
  const out = new Set<string>();
  const add = (s: string | null) => s && s >= addDays(today, -7) && s <= addDays(today, 200) && out.add(s);
  const t = stripContacts(text);
  // 26.10.20 · 2026-10-20 · 2026/10/20
  for (const m of t.matchAll(/(?<!\d)(20\d{2}|\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/g)) {
    const y = m[1]!.length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
    add(ymdOf(y, Number(m[2]), Number(m[3])));
  }
  const noFull = t.replace(/(?<!\d)(20\d{2}|\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/g, " ");
  // 10/27 · 11/2 (뒤에 ':' 나 숫자가 붙으면 시간·비율)
  for (const m of noFull.matchAll(/(?<![\d.:])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d:]|\s*(?:타임|명))/g)) add(inferYear(Number(m[1]), Number(m[2]), today));
  // 10월 27일 · 10월27일
  for (const m of noFull.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) add(inferYear(Number(m[1]), Number(m[2]), today));
  // 27일(화) · 27일 금요일 · 날짜 줄의 27일
  const dayOnly = (src: string, needDow: boolean) => {
    const re = needDow
      ? /(?<![\d월])(\d{1,2})\s*일\s*(?:\(\s*([일월화수목금토])\s*\)|([일월화수목금토])요일)/g
      : /(?<![\d월주])(\d{1,2})\s*일(?![간동차째])/g;
    for (const m of src.matchAll(re)) {
      const d = Number(m[1]);
      let s = inferYear(Number(today.slice(5, 7)), d, today);
      // 오늘보다 앞이면 다음 달
      if (s && s < today) {
        const [y, mo] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
        s = mo === 12 ? ymdOf(y + 1, 1, d) : ymdOf(y, mo + 1, d);
      }
      const wd = m[2] ?? m[3];
      if (s && wd && WD.indexOf(wd) !== dowOf(s)) continue;
      add(s);
    }
  };
  if (!out.size) dayOnly(noFull.replace(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, " "), true);
  if (!out.size && dateLines) dayOnly(stripContacts(dateLines), false);
  // 날짜가 없을 때만 오늘·금일·당일·내일·모레 ("당일 입금" 같은 말이 날짜를 늘리지 않게)
  if (!out.size) {
    if (/오늘|금일|당일\s*(?:대강|급구|저녁|오전|오후|수업)/.test(t)) add(today);
    if (/내일|익일/.test(t) && !/내일\s*부터/.test(t)) add(addDays(today, 1));
    if (/모레/.test(t)) add(addDays(today, 2));
  }
  return [...out].sort();
}

/** 요일: "월수금", "월,수,금", "화·목", "매주 목요일", "토 오전" (수업·금일·월급 같은 낱말은 빼고) */
function findWeekdays(text: string): number[] {
  const out = new Set<number>();
  const t = text.replace(/\(\s*[일월화수목금토]\s*\)/g, " "); // 날짜 뒤 (화) 는 요일 모집이 아님
  for (const m of t.matchAll(/(?<![가-힣])((?:[월화수목금토일]\s*[,/·.~\s]?\s*){1,6}[월화수목금토일])(?=요일|$|[^가-힣]|오전|오후|저녁|아침|점심|반)/g)) {
    const chunk = m[1]!.replace(/[^일월화수목금토]/g, "");
    if (chunk.length < 2) continue;
    // "월~금" 은 사이 요일까지
    if (/~/.test(m[1]!) && chunk.length === 2) {
      const [a, b] = [WD.indexOf(chunk[0]!), WD.indexOf(chunk[1]!)];
      for (let d = a; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === b) break;
      }
      continue;
    }
    for (const c of chunk) out.add(WD.indexOf(c));
  }
  for (const m of t.matchAll(/(?<![가-힣])([월화수목금토일])\s*요일/g)) out.add(WD.indexOf(m[1]!));
  for (const m of t.matchAll(/(?<![가-힣])(?:매주\s*)?([월화수목금토일])(?=\s+(?:오전|오후|저녁|아침|점심)|\s*반(?![가-힣]))/g)) out.add(WD.indexOf(m[1]!));
  if (/평일/.test(t) && !out.size) [1, 2, 3, 4, 5].forEach((d) => out.add(d));
  if (/주말/.test(t) && !out.size) [0, 6].forEach((d) => out.add(d));
  return [...out].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// 시간
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");

function toHm(h: number, min: number, pm: boolean, am: boolean): string | null {
  if (h > 24 || min > 59) return null;
  let hh = h;
  if (pm && hh < 12) hh += 12;
  // 오전·오후 표시가 없으면 1~6시는 오후 (새벽 수업은 없다)
  else if (!am && !pm && hh >= 1 && hh <= 6) hh += 12;
  if (hh === 24) hh = 0;
  if (hh < 5) return null;
  return `${pad(hh)}:${pad(min)}`;
}

function findTimes(lines: string[], timeLines: string[]): string[] {
  const out = new Set<string>();
  let pmCtx = false;
  let amCtx = false;
  const scan = (raw: string, bare: boolean) => {
    let l = stripContacts(raw)
      // 날짜 (10/27, 26.10.20) 는 시간이 아님
      .replace(/(?<!\d)(20\d{2}|\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/g, (all, _y, mo, d) => (Number(mo) <= 12 && Number(d) <= 31 ? " " : all))
      .replace(/(?<![\d:])\d{1,2}\s*\/\s*\d{1,2}(?![\d:])/g, " ")
      .replace(/\d+(?:\.\d+)?\s*만\s*원?|\d{1,3}(?:,\d{3})+\s*원?|\d+\s*:\s*1(?!\d)/g, " ");
    if (/오후|저녁|pm|PM|밤/.test(l)) pmCtx = true;
    if (/오전|아침|AM|am/.test(l)) amCtx = /오전|아침|AM|am/.test(l) && !/오후|저녁/.test(l.split(/오전|아침/)[0] ?? "");
    // 줄 안에서 "오전 9:30/ 10:30 오후 6:30/7:30" 처럼 바뀌므로 조각마다
    const parts = l.split(/(?=오전|오후|저녁|아침|점심|밤)/);
    for (const p of parts) {
      const pm = /^(오후|저녁|밤)/.test(p) || (!/^(오전|아침)/.test(p) && pmCtx && !amCtx);
      const am = /^(오전|아침)/.test(p) || (!/^(오후|저녁|밤)/.test(p) && amCtx && !pmCtx);
      // 범위 끝(~ 뒤)은 빼고
      const q = p.replace(/~\s*(?:오전|오후)?\s*\d{1,2}\s*(?::\s*\d{2}|시(?:\s*\d{1,2}\s*분)?)/g, " ");
      for (const m of q.matchAll(/(?<![\d.])(\d{1,2})\s*:\s*(\d{2})(?!\d)/g)) {
        const s = toHm(Number(m[1]), Number(m[2]), pm && Number(m[1]) < 12, am);
        if (s) out.add(s);
      }
      // 7,8,9시 · 8.9시 · 19시,20시 · 7시 30분 · 7시반
      for (const m of q.replace(/(\d{1,2})\s*:\s*\d{2}/g, " ").matchAll(/((?:\d{1,2}\s*[,./]\s*)*)(\d{1,2})\s*시(?!간|작|청|부터\s*\d{1,2}시간)\s*(?:(\d{1,2})\s*분|(반))?/g)) {
        const hours = [...(m[1] ?? "").matchAll(/\d{1,2}/g)].map((x) => Number(x[0]));
        const min = m[4] ? 30 : m[3] ? Number(m[3]) : 0;
        for (const h of hours) {
          const s = toHm(h, 0, pm && h < 12, am);
          if (s) out.add(s);
        }
        const s = toHm(Number(m[2]), min, pm && Number(m[2]) < 12, am);
        if (s) out.add(s);
      }
      // 시간 줄의 "18.19.20.21" 처럼 숫자만
      if (bare && !/[:시]/.test(q)) {
        const q2 = q.replace(/\d+\s*(?:타임|명|분|회|일|주|개|만|원|%|시간)/g, " ");
        const nums = [...q2.matchAll(/(?<!\d)(\d{1,3})(?!\d)/g)].map((x) => Number(x[1]));
        if (nums.length >= 1 && nums.every((n) => n >= 5 && n <= 23)) for (const n of nums) { const s = toHm(n, 0, pm && n < 12, am); if (s) out.add(s); }
      }
    }
  };
  if (timeLines.length) timeLines.forEach((l) => scan(l, true));
  if (!out.size) lines.forEach((l) => scan(l, false));
  return [...out].sort().slice(0, 12);
}

// ---------------------------------------------------------------------------
// 페이
// ---------------------------------------------------------------------------
function findPay(payLines: string[], all: string[], times: number, timeCount: number): number | null {
  const PAYWORD = /페이|급여|수업료|강사료|타임비|대강비|시급|회당|타임당|시간당|만\s*원|\d{2},\d{3}\s*원/;
  const candidates = [...payLines, ...all.filter((l) => PAYWORD.test(l))];
  for (const raw of candidates) {
    const l = stripContacts(raw).replace(/\d+(?:\.\d+)?\s*%/g, " ");
    let v: number | null = null;
    const range = /(\d+(?:\.\d+)?)\s*(?:~|-)\s*(\d+(?:\.\d+)?)\s*만/.exec(l);
    const man = /(\d+(?:\.\d+)?)\s*만\s*원?/.exec(l);
    const won = /(?<![\d.])(\d{1,3}(?:,\d{3})+|\d{5,6})\s*(?:원)?(?![\d.])/.exec(l);
    const bare = /(?<![\d./])(?<!\d\s?:)(\d{1,2}(?:\.\d{1,2})?)(?![\d.:/]|\s*(?:시|타임|명|분|회|일|주|개|월|년|층|%|:))/.exec(l.replace(/\d+\s*타임\s*\d*/g, " "));
    if (range) v = Number(range[1]) * 10000;
    else if (man) v = Number(man[1]) * 10000;
    else if (won) v = Number(won[1]!.replace(/,/g, ""));
    else if (bare && /페이|급여|수업료|강사료|타임비|대강비|시급|회당|타임당/.test(l) && Number(bare[1]) >= 1 && Number(bare[1]) <= 20) v = Number(bare[1]) * 10000;
    if (v === null || v < 10000 || v > 300000) continue;
    v = Math.round(v);
    // "페이 7.5" 에 두 타임이면 합계일 수 있다: 타임당 표시가 없고 한 타임으로 보기엔 크면 나눈다
    const n = Math.max(times, timeCount);
    if (v >= 60000 && n >= 2 && !/타임당|회당|시간당|1\s*타임|한\s*타임|각/.test(l) && v / n >= 20000) v = Math.round(v / n / 500) * 500;
    return v;
  }
  return null;
}

function findTax(lines: string[]): boolean | null {
  for (const l of lines) {
    if (!/3\.3|공제|세금|원천/.test(l)) continue;
    if (/공제\s*(?:없|안|x|X|무|미)|미공제|[xX×✕]\s*$|:\s*(?:x|X|무|없음|N|n|미적용|아니)|세금\s*공제\s*[xX]|공제\s*없이|비공제|세전/.test(l)) return false;
    if (/공제\s*후|차감|:\s*(?:o|O|유|있음|Y|y|적용|네)|[oO○⭕]\s*$|공제\s*있|세후|3\.3\s*%?\s*공제/.test(l)) return true;
  }
  return null;
}

function findPayday(payday: string[], lines: string[]): string {
  if (payday[0]) return payday[0].slice(0, 60);
  const l = lines.find((x) => /(?:수업|종료)\s*(?:후|직후)\s*(?:바로)?\s*(?:지급|입금)|당일\s*(?:입금|지급)|매월\s*\d{1,2}\s*일/.test(x));
  const m = l && /(?:(?:마지막\s*)?수업\s*(?:종료\s*)?(?:후|직후)\s*(?:바로)?\s*(?:지급|입금)|당일\s*(?:수업\s*)?(?:입금|지급)|매월\s*\d{1,2}\s*일\s*(?:이전|이내)?\s*(?:지급|입금)?)/.exec(l);
  return m ? m[0].slice(0, 60) : "";
}

// ---------------------------------------------------------------------------
// 수업 종류·기구·업체명
// ---------------------------------------------------------------------------
const CLASS_RULES: [ClassType, RegExp][] = [
  ["바레", /바레|발레\s*핏|발레핏|barre/i],
  ["줌바·댄스", /줌바|댄스|에어로빅|zumba/i],
  ["기구필라테스", /기구|리포머|레포머|캐포머|캐딜락|체어|바렐|콤비|스프링보드|타워/],
  ["매트필라테스", /매트|소도구/],
  ["플라잉", /플라잉/],
  ["요가", /요가|하타|빈야사|아쉬탕가|인요가|명상|yoga/i],
];

function findClass(classLines: string, text: string, studio: string): ClassType | null {
  const body = text.replace(studio, " ");
  for (const src of [classLines, body]) {
    if (!src) continue;
    for (const [c, re] of CLASS_RULES) if (re.test(src)) return c;
  }
  return null;
}

function findEquipment(text: string): string[] {
  const out: string[] = [];
  if (/캐포머|캐딜락\s*(?:리포머|세팅)/.test(text)) out.push("캐포머");
  if (/(?<!캐)(?:리포머|레포머)/.test(text) && !/콤비\s*리포머|콤피\s*리포머/.test(text)) out.push("리포머");
  if (/캐딜락/.test(text) && !out.includes("캐포머")) out.push("캐딜락");
  if (/콤비|콤피/.test(text)) out.push("콤비");
  if (/체어/.test(text)) out.push("체어");
  if (/바렐/.test(text)) out.push("바렐");
  if (/스프링\s*보드/.test(text)) out.push("스프링보드");
  if (/소도구/.test(text)) out.push("소도구");
  return out.filter((e) => (EQUIPMENT as readonly string[]).includes(e));
}

const STUDIO_KEY = /(?:필라테스|요가|바레|스튜디오|피트니스|휘트니스|짐|GYM|gym|PT|웰니스)$/;
const GENERIC = /^(?:매트|기구|소도구|도구|그룹|정규|대강|바레|요가|플라잉|필라테스|개인|프리랜서|토탈|치유|그룹레슨|강사|오늘|내일|당일|급구|재활|헬스|웰니스|커뮤니티|피트니스)?(?:필라테스|요가|바레|스튜디오|피트니스|휘트니스|짐|PT|웰니스|센터)$/;
/** 업체명 앞에 붙지 않는 말: 꾸밈말(…한/는/인/의/에서), 시간·요일·지역 */
const NOT_NAME = /(?:한|는|인|의|에서|실|운|된|던|중|님|요|다|고|서|며|갈|할|볼|줄|께)$|^(?:오전|오후|저녁|아침|점심|[월화수목금토일]요일|매주|안녕하세요|저희|여기|위치|센터|바로|출구|앞|도보)$|^\d|[시구군도]$|^\(|^\[/;

function findStudio(studioLines: string[], lines: string[]): string {
  if (studioLines[0]) return studioLines[0].replace(/[‘’'"“”]/g, "").slice(0, 60);
  for (const l of lines.slice(0, 12)) {
    const toks = stripContacts(l).replace(/[\[\]()‘’'"“”!?,~:]/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!.replace(/(?:에서|입니다|이에요|은|는|을|를)$/, "");
      if (!STUDIO_KEY.test(t)) continue;
      const parts = [t];
      // "회기 현 필라테스", "캡슐바레 & 필라테스": 키워드뿐인 낱말이면 앞 낱말을 한두 개
      if (GENERIC.test(t) || /^[가-힣]{1,3}&/.test(t)) {
        for (let k = i - 1; k >= Math.max(0, i - 2); k--) {
          const p = toks[k]!;
          if (NOT_NAME.test(p) || !/^[A-Za-z0-9가-힣&]+$/.test(p) || (GENERIC.test(p) && p !== "&") || findSido(p) || findDistricts(p).length) break;
          parts.unshift(p);
          if (p !== "&" && !/&$/.test(p) && !/^[A-Za-z가-힣]{1,2}$/.test(p)) break;
        }
        if (parts.length === 1) continue;
      }
      // 뒤의 "○○점", "& 필라테스 ○○점"
      let j = i + 1;
      if (toks[j] === "&" && toks[j + 1] && STUDIO_KEY.test(toks[j + 1]!)) {
        parts.push("&", toks[j + 1]!);
        j += 2;
      }
      const branch = toks[j]?.replace(/(?:입니다|이에요|에서|은|는|이|의)$/, "");
      if (branch && /^[가-힣A-Za-z0-9]{1,10}점$/.test(branch)) parts.push(branch);
      const name = parts.join(" ").replace(/\s+/g, " ").trim();
      if (/강사|구인|모집|대강|수업|선생님/.test(name) || GENERIC.test(name.replace(/\s/g, ""))) continue;
      return name.slice(0, 60);
    }
  }
  return "";
}

const NOTE_RE = /지각|노쇼|펑크|요청|우대|초보|주차|폐강|자격|경력|준비|일찍|미리\s*오|분\s*전|책임감|정원|\d\s*:\s*1(?!\d)|\d\s*대\s*1/;

function findNotes(noteLines: string[], lines: string[]): string {
  const picked = [...noteLines, ...lines.filter((l) => NOTE_RE.test(l))].map((l) => stripContacts(l).trim()).filter((l) => l.length >= 2);
  return [...new Set(picked)].join("\n").slice(0, 600);
}

// ---------------------------------------------------------------------------

export function parseGig(raw: string, now = new Date()): GigDraft {
  const today = kstYmd(now);
  const lines = cleanLines(raw.slice(0, 6000));
  const text = lines.join("\n");
  const f = labeled(lines);
  const get = (k: Field) => f.get(k) ?? [];

  const contact = contacts([...get("contact"), text].join("\n")).slice(0, 4).join(" · ");
  const studio = findStudio(get("studio"), lines);
  const whereText = get("where").join("\n");
  const reg = region(whereText, stripContacts(text), `${whereText}\n${lines.slice(0, 2).join("\n")}`);
  const dateLines = get("date").join("\n");
  const dates = findDates(text, dateLines, today);
  const times = findTimes(lines, get("time"));
  const timeCount = Number(/(\d)\s*타임/.exec(text)?.[1] ?? 0);
  const weekdays = findWeekdays(stripContacts(text));
  const classLines = get("class").join("\n");
  const classType = findClass(classLines, text, studio);
  const pay = findPay(get("pay"), lines, times.length, timeCount);
  const tax = findTax([...get("tax"), ...lines]);
  const payday = findPayday(get("payday"), lines);
  const equipment = findEquipment(text);

  const subWord = /대강|대타|급구|땜빵|대체\s*강사/.test(text);
  // "월수금 대강" 처럼 날짜 없이 요일만 있는 대강은 다가오는 그 요일 날짜로
  if (subWord && !dates.length && weekdays.length && !/장기|정규|고정/.test(text)) {
    for (let k = 0; k < 7; k++) {
      const d = addDays(today, k);
      if (weekdays.includes(dowOf(d))) dates.push(d);
    }
  }
  const regWord = /정규|고정|채용|장기|정기|구인|모집|오픈\s*멤버/.test(text);
  const kind: GigKind | null = subWord && dates.length ? "sub" : regWord && !subWord ? "regular" : dates.length ? "sub" : weekdays.length ? "regular" : subWord ? "sub" : null;

  const address = (get("where")[0] ?? "").slice(0, 120);
  const notes = findNotes(get("note"), lines.filter((l) => !LABEL.test(l) || /요청|특이|기타/.test(l)));

  const draft: Omit<GigDraft, "filled"> = {
    kind,
    studio,
    sido: reg.sido,
    sigungu: reg.sigungu,
    station: reg.station,
    address: address && !contacts(address).length ? address : "",
    dates: kind === "regular" ? dates.filter((d) => d >= today).slice(0, 1) : dates,
    // 대강은 날짜가 있으면 요일은 비운다
    weekdays: kind === "sub" && dates.length ? [] : weekdays,
    times,
    classType,
    equipment,
    pay,
    tax,
    payday,
    contact,
    notes,
  };
  const filled = [draft.kind, draft.studio, draft.sido, draft.dates.length || draft.weekdays.length, draft.times.length, draft.classType, draft.pay, draft.contact].filter(Boolean).length;
  return { ...draft, filled };
}

/** 정규 글에 "시작일" 로 들어온 날짜 하나는 그대로 두고, 대강은 날짜가 꼭 있어야 한다 — 화면에서 쓰는 안내 */
export const PARSE_FIELDS = ["kind", "studio", "sido", "dates", "times", "classType", "pay", "contact"] as const;
export { CLASS_TYPES };
