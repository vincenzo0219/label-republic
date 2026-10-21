/**
 * 테스트 결과 댓글끼리 짝 찾기 (Sprint 94). 같은 팀·같은 타입·같은 점수인 사람을 첫 댓글 환영 답글에서 @로 불러
 * 사람과 사람을 바로 잇는다. 결과 한 줄은 "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: FC서울" 꼴이라 앞부분이 타입이다.
 */

// K리그1·2 구단: 이름 하나, 사람들이 쓰는 표기 여러 개. 겹치는 표기(수원FC/수원삼성, 서울이랜드/FC서울)는 긴 것부터 본다
const TEAMS: [string, string[]][] = [
  ["수원FC", ["수원fc"]],
  ["수원삼성", ["수원삼성", "수원블루윙즈", "블루윙즈", "수원"]],
  ["서울이랜드", ["서울이랜드", "이랜드"]],
  ["FC서울", ["fc서울", "서울"]],
  ["울산", ["울산"]],
  ["전북", ["전북"]],
  ["포항", ["포항"]],
  ["인천", ["인천"]],
  ["대전", ["대전"]],
  ["강원", ["강원"]],
  ["제주", ["제주"]],
  ["광주", ["광주"]],
  ["대구", ["대구"]],
  ["김천", ["김천"]],
  ["안양", ["안양"]],
  ["부천", ["부천"]],
  ["성남", ["성남"]],
  ["경남", ["경남"]],
  ["전남", ["전남"]],
  ["부산", ["부산"]],
  ["청주", ["충북청주", "청주"]],
  ["아산", ["충남아산", "아산"]],
  ["천안", ["천안"]],
  ["김포", ["김포"]],
  ["안산", ["안산"]],
  ["화성", ["화성"]],
];

// KBO 10개 구단 (10/21 야구 팬 테스트). 결과 한 줄이 "응원 구단:" 이라 K리그 "응원 팀:" 과 섞이지 않는다
const KBO_TEAMS: [string, string[]][] = [
  ["KIA", ["kia", "기아", "타이거즈"]],
  ["삼성", ["삼성", "라이온즈"]],
  ["LG", ["lg", "엘지", "트윈스"]],
  ["두산", ["두산", "베어스"]],
  ["KT", ["kt", "케이티", "위즈"]],
  ["SSG", ["ssg", "랜더스"]],
  ["롯데", ["롯데", "자이언츠"]],
  ["한화", ["한화", "이글스"]],
  ["NC", ["nc", "엔씨", "다이노스"]],
  ["키움", ["키움", "히어로즈"]],
];

/** "응원 팀:"(K리그) 또는 "응원 구단:"(KBO) 뒤에 쓴 구단 */
export function teamOf(body: string): string | undefined {
  for (const [marker, table] of [["응원 구단:", KBO_TEAMS], ["응원 팀:", TEAMS]] as const) {
    const i = body.indexOf(marker);
    if (i < 0) continue;
    const t = body.slice(i + marker.length).toLowerCase().replace(/\s+/g, "");
    return table.find(([, keys]) => keys.some((k) => t.includes(k)))?.[0];
  }
  return undefined;
}

/** 결과 한 줄의 앞부분 (" / " 앞) — 같은 테스트의 같은 타입·점수끼리 같다 */
export function typeOf(body: string): string | undefined {
  const head = body.split("\n")[0]!.split(" / ")[0]!.trim();
  return head.includes("테스트") ? head : undefined;
}

/** 사람에게 보여 줄 타입 이름: "⚽ 축구 팬 테스트: 🚌 원정 직관러" → "🚌 원정 직관러" */
export function typeLabel(type: string): string {
  const i = type.indexOf("테스트");
  return type.slice(i + 3).replace(/^[:\s]+/, "").trim() || type;
}

export type Peer = { nickname: string; why: "team" | "type"; label: string };

/** earlier = 같은 글의 앞선 사람 댓글, 최근 것부터. 같은 팀이 먼저, 없으면 같은 타입. 멘션이 되도록 닉네임 2자 이상만 */
export function findPeer(body: string, nickname: string, earlier: { nickname: string; body: string }[]): Peer | null {
  const others = earlier.filter((e) => e.nickname.length >= 2 && e.nickname.toLowerCase() !== nickname.toLowerCase());
  const team = teamOf(body);
  if (team) {
    const p = others.find((e) => teamOf(e.body) === team);
    if (p) return { nickname: p.nickname, why: "team", label: team };
  }
  const type = typeOf(body);
  if (type) {
    const p = others.find((e) => typeOf(e.body) === type);
    if (p) return { nickname: p.nickname, why: "type", label: typeLabel(type) };
  }
  return null;
}
