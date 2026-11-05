/**
 * ⭐ 애니·만화 덕후방 "이번 분기 신작 별점판" 고르기 목록 (11/5 대표님 "이거는 신작을 스스로 올려야해?").
 * 제목을 직접 치는 대신 이번 분기 신작을 칩으로 고른다. 목록에 없으면 아래 "목록에 없어요" 칸에 직접 적는다.
 *
 * 2026년 4분기(10월 신작). 2026-11-05 웹 검색으로 작품마다 2곳 이상에서 2026년 10월 방영을 확인한 것만 넣었다.
 * 확인하지 못한 작품(정킷 뱅크: 방영 연기 발표, 용한소녀: 2025년 작품, 한국어 제목을 못 찾은 작품)은 뺐다.
 * 제목은 국내 기사·서비스에서 쓰는 한국어 이름. 출처는 줄마다 적는다.
 *
 * 갱신 계획: 분기가 바뀌는 달(1·4·7·10월) 첫 주에 월간 루틴이 이 파일의 ANIME_SEASON 을 새 분기로 바꾼다.
 *  - season 은 "YYYY-Qn" (별점판 period "quarter" 와 같은 분기). 지난 분기 목록은 지운다 (지난 별점은 표 122 에 그대로 남는다)
 *  - 제목은 30자 이하 (별점판 제목 칸 최대 길이). 2곳 이상에서 확인된 것만, 15~25개
 *  - 분기가 바뀌었는데 갱신이 늦으면 animeSeasonTitles() 가 빈 목록을 돌려 직접 적는 칸만 보인다 (지난 분기 제목이 남지 않게)
 */

export type AnimeSeason = { season: string; label: string; titles: readonly string[] };

export const ANIME_SEASON: AnimeSeason = {
  season: "2026-Q4",
  label: "2026년 가을(10월) 신작",
  titles: [
    "약사의 혼잣말 3기", // eyesmag 2025-10 3기 2026년 10월 발표, gamesradar
    "도쿄 리벤저스: 삼천전쟁편", // times.abema.tv/ko 10월 2일 방송, anitrendz 2026-03-29
    "블랙 클로버 2기", // times.abema.tv/ko TV도쿄 10월, anitrendz 2025-12-20
    "푸른 상자 2기", // whats-on-netflix 10월 4일, animecorner
    "란마 1/2 3기", // whats-on-netflix 10월, animecorner, eyesmag(국내 제목)
    "아오아시 2기", // times.abema.tv/ko, animecorner 10월 4일 NHK E테레
    "도원암기 2기", // dexerto.fr 10월 2일, animotaku, haveagood-holiday(국내 제목)
    "얼음 성벽 2기", // whats-on-netflix 10월 1일, anitrendz 2026-07-02
    "드래곤볼 슈퍼: 비루스", // anitrendz 2026-01-26, siliconera 10월 11일 후지TV, cineplay
    "사이버펑크: 엣지러너 2", // CD PROJEKT RED 보도자료 10월 20일 넷플릭스, pcgamer, insight.co.kr
    "템빨 ~아이템의 힘~", // 데일리안 한일 동시 공개, animenewsnetwork 2026-06-02, 10월 2일
    "FX 전사 쿠루미", // animenewsnetwork 2026-08-31 10월 1일, anitrendz 2026-08-01
    "야생의 라스트 보스가 나타났다! 2기", // 나무위키 2026년 10월 목록(라프텔), hoshika 2026-10 Tokyo MX
    "귀환자의 마법은 특별해야 합니다 2기", // animecorner 2026-10 트레일러, otakuusamagazine
    "전생했더니 검이었습니다 2기", // anitrendz HIDIVE 2026 가을, animecorner 10월 데뷔
  ],
};

/** 지금 분기 (KST) "YYYY-Qn" */
export function currentQuarter(d = new Date()): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${k.getUTCFullYear()}-Q${Math.floor(k.getUTCMonth() / 3) + 1}`;
}

/** 별점판에 칩으로 보일 제목. 목록이 지난 분기 것이면 빈 목록 (직접 적는 칸만) */
export function animeSeasonTitles(d = new Date()): readonly string[] {
  return ANIME_SEASON.season === currentQuarter(d) ? ANIME_SEASON.titles : [];
}
