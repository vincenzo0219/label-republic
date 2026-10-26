/**
 * 🙌 자동 조 편성의 만날 곳 (10/26). 행사 글 제목·본문(📍 줄)에서 행사장을 찾아, 조마다 사람 많은 공공 장소 하나와 가까운 역을 정해 준다.
 * 검증일 2026-10-26: 두 곳 이상에서 확인한 지점만 적었다. 확인이 안 된 곳은 "공식 입구(정문) 앞" 만 쓴다.
 * - 코엑스: 삼성역 5·6번 출구 연결통로(밀레니엄광장 방면), 봉은사역 7번 출구 연결통로(아셈플라자 방면)
 *   (coex.co.kr 오시는 길 국문·영문 안내, 코엑스 베뉴 가이드)
 * - aT센터: 신분당선 양재시민의숲역과 지하 연결 (aT센터 행사 안내문 여러 건, 2017 언론 보도)
 * - 역 이름: 킨텍스=대화역, SETEC=학여울역, 벡스코=벡스코역, 서울월드컵경기장=월드컵경기장역, 라이온즈파크=대공원역 (공식·언론 2곳 이상)
 * - 서울월드컵경기장 출구 번호는 공식 안내끼리 1번·2번이 엇갈려 적지 않았다. 엑스코는 도시철도 엑스코선이 아직 공사 중이라 역을 비워 둔다.
 * 좌표(lat/lng)는 도착 확인(500m 안) 판정용 시설 중심 근사값이다. 틀려도 "만났어요" 확인으로 도착을 인정받을 수 있다.
 */

export type MeetPoint = { name: string; station: string | null };
export type Venue = { key: string; name: string; aliases: string[]; points: MeetPoint[]; lat: number | null; lng: number | null };

const gate = (venue: string, station: string | null): MeetPoint => ({ name: `${venue} 공식 입구(정문) 앞`, station });

export const VENUES: Venue[] = [
  {
    key: "coex",
    name: "코엑스",
    aliases: ["코엑스", "coex", "삼성동 코엑스"],
    points: [
      { name: "삼성역 5·6번 출구 코엑스 연결통로 입구", station: "삼성역" },
      { name: "봉은사역 7번 출구 코엑스 연결통로 입구", station: "봉은사역" },
    ],
    lat: 37.5118,
    lng: 127.0592,
  },
  { key: "kintex2", name: "킨텍스 제2전시장", aliases: ["킨텍스 제2전시장", "킨텍스 2전시장", "kintex 2", "킨텍스2"], points: [gate("킨텍스 제2전시장", "대화역")], lat: 37.6655, lng: 126.7395 },
  { key: "kintex1", name: "킨텍스 제1전시장", aliases: ["킨텍스 제1전시장", "킨텍스 1전시장", "킨텍스", "kintex"], points: [gate("킨텍스 제1전시장", "대화역")], lat: 37.6688, lng: 126.7455 },
  { key: "setec", name: "SETEC", aliases: ["setec", "세텍", "학여울"], points: [gate("SETEC", "학여울역")], lat: 37.4967, lng: 127.0697 },
  {
    key: "at",
    name: "aT센터",
    aliases: ["양재 aT센터", "aT센터", "에이티센터"],
    points: [{ name: "양재시민의숲역 aT센터 지하 연결통로 입구", station: "양재시민의숲역" }, gate("aT센터", "양재시민의숲역")],
    lat: 37.4687,
    lng: 127.0386,
  },
  { key: "bexco2", name: "벡스코 제2전시장", aliases: ["벡스코 제2전시장", "벡스코 2전시장", "bexco 2"], points: [gate("벡스코 제2전시장", "벡스코역")], lat: 35.1699, lng: 129.1376 },
  { key: "bexco1", name: "벡스코 제1전시장", aliases: ["벡스코 제1전시장", "벡스코 1전시장", "벡스코", "bexco"], points: [gate("벡스코 제1전시장", "벡스코역")], lat: 35.1689, lng: 129.1360 },
  { key: "exco", name: "엑스코", aliases: ["엑스코", "exco"], points: [gate("엑스코", null)], lat: 35.9067, lng: 128.6131 },
  { key: "pubg-seongsu", name: "PUBG 성수", aliases: ["pubg성수", "pubg 성수", "펍지 성수", "배그 성수"], points: [gate("PUBG 성수", null)], lat: null, lng: null },
  { key: "seoul-worldcup", name: "서울월드컵경기장", aliases: ["서울월드컵경기장", "상암 월드컵경기장", "상암월드컵경기장"], points: [gate("서울월드컵경기장", "월드컵경기장역")], lat: 37.5683, lng: 126.8972 },
  { key: "lions-park", name: "대구 삼성라이온즈파크", aliases: ["삼성라이온즈파크", "라이온즈파크", "라팍"], points: [gate("라이온즈파크", "대공원역")], lat: 35.8411, lng: 128.6815 },
];

/** 행사장을 못 찾았을 때 */
export const FALLBACK_POINT: MeetPoint = { name: "행사장 공식 입구 앞", station: null };

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s·・()[\]-]/g, "");

/** 📍 줄을 먼저, 없으면 제목 → 본문 전체. 별칭이 긴 것부터 맞춰 "킨텍스 제2전시장"이 "킨텍스"보다 먼저 */
export function matchVenue(title: string, body = ""): Venue | null {
  const pin = body.split("\n").filter((l) => l.includes("📍")).join(" ");
  const pairs = VENUES.flatMap((v) => v.aliases.map((a) => ({ v, a: norm(a) }))).sort((x, y) => y.a.length - x.a.length);
  for (const text of [pin, title, body]) {
    const t = norm(text);
    if (!t) continue;
    const hit = pairs.find((p) => t.includes(p.a));
    if (hit) return hit.v;
  }
  return null;
}

export const naverMapUrl = (point: string) => `https://map.naver.com/p/search/${encodeURIComponent(point)}`;

/** 두 좌표 사이 거리(m, 하버사인): 도착 확인 500m 판정. 좌표는 저장하지 않는다 */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const GEO_RADIUS_M = 500;
