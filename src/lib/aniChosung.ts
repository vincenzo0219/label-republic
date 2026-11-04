/**
 * 🎨 애니 제목 초성 60초 (11/4 대표님 "책·애니·K리그로 진행해").
 * 하루 한 판, 전국이 같은 순서: 초성("ㅈㄱㅇ ㄱㅇ")을 보고 애니 제목을 적는다. 60초 안에 맞힌 개수가 점수, 같으면 마지막으로 맞힌 시각이 빠른 쪽이 위.
 * 제목은 국내에서 방영·개봉한 이름(공식 한국어 제목)만, 그림·대사는 쓰지 않는다.
 * 서버·브라우저·테스트 공용 순수 함수.
 */

/** [국내 제목, 받아 주는 다른 표기...] */
export const ANI_TITLES: readonly (readonly string[])[] = [
  // ── 일본 TV 애니 (소년·액션) ──
  ["원피스"], ["나루토"], ["드래곤볼"], ["슬램덩크"], ["진격의 거인"], ["귀멸의 칼날"], ["주술회전"], ["체인소 맨", "체인소맨"],
  ["스파이 패밀리"], ["명탐정 코난"], ["원펀맨"], ["강철의 연금술사"], ["데스노트"], ["블리치"], ["헌터x헌터", "헌터헌터", "헌터 헌터"],
  ["나의 히어로 아카데미아", "히로아카"], ["하이큐"], ["쿠로코의 농구"], ["은혼"], ["신세기 에반게리온", "에반게리온"], ["카우보이 비밥"],
  ["공각기동대"], ["이누야샤"], ["시티헌터"], ["은하철도 999", "은하철도999"], ["미래소년 코난"], ["바람의 검심"], ["유유백서"],
  ["죠죠의 기묘한 모험", "죠죠"], ["북두의 권"], ["베르세르크"], ["기생수"], ["도쿄 구울"], ["페어리 테일"], ["일곱 개의 대죄"],
  ["블랙 클로버"], ["닥터 스톤"], ["약속의 네버랜드"], ["도로로"], ["빈란드 사가"], ["불꽃 소방대"], ["문호 스트레이독스"],
  ["모브사이코 100", "모브사이코"], ["도쿄 리벤저스"], ["블루 록", "블루록"], ["괴수 8호"], ["사카모토 데이즈"], ["단다단"],
  ["유희왕"], ["아이실드 21"], ["테니스의 왕자"], ["H2"], ["미스터 초밥왕"], ["요리왕 비룡"], ["흑집사"],
  ["식극의 소마"], ["바쿠만"], ["기동전사 건담", "건담"], ["은하영웅전설"], ["코드 기어스"], ["슈타인즈 게이트"], ["20세기 소년"], ["우주형제"], ["메이드 인 어비스"],
  // ── 일본 TV 애니 (일상·로맨스·판타지) ──
  ["장송의 프리렌", "프리렌"], ["최애의 아이"], ["봇치 더 록", "봇치더록"], ["약사의 혼잣말"], ["던전밥"], ["리코리스 리코일"],
  ["바이올렛 에버가든"], ["케이온"], ["스즈미야 하루히의 우울"], ["러브 라이브", "러브라이브"], ["소드 아트 온라인"],
  ["전생했더니 슬라임이었던 건에 대하여", "전생슬"], ["이 멋진 세계에 축복을"], ["오버로드"], ["노 게임 노 라이프"], ["무직전생"],
  ["4월은 너의 거짓말"], ["토라도라"], ["클라나드"], ["그날 본 꽃의 이름을 우리는 아직 모른다", "아노하나"], ["너에게 닿기를"],
  ["카구야 님은 고백받고 싶어", "카구야님은 고백받고 싶어"], ["그 비스크 돌은 사랑을 한다"],
  ["꽃보다 남자"], ["나나"], ["허니와 클로버"], ["아즈망가 대왕"], ["은수저"], ["3월의 라이온"], ["빙과"],
  ["걸즈 앤 판저"], ["오란고교 호스트부"], ["스킵과 로퍼"], ["마법소녀 마도카 마기카", "마도카 마기카"], ["슬레이어즈"],
  // ── 극장 애니 ──
  ["너의 이름은"], ["센과 치히로의 행방불명"], ["이웃집 토토로"], ["하울의 움직이는 성"], ["천공의 성 라퓨타"], ["마녀배달부 키키"],
  ["붉은 돼지"], ["모노노케 히메"], ["벼랑 위의 포뇨"], ["바람이 분다"], ["마루 밑 아리에티"], ["날씨의 아이"], ["스즈메의 문단속"],
  ["초속 5센티미터", "초속5센티미터"], ["언어의 정원"], ["목소리의 형태"], ["시간을 달리는 소녀"], ["늑대아이"], ["썸머 워즈", "썸머워즈"],
  ["괴물의 아이"], ["용과 주근깨 공주"], ["미래의 미라이"], ["아키라"],
  // ── 우리나라 방영 제목으로 익숙한 애니 ──
  ["짱구는 못말려", "짱구는 못 말려"], ["도라에몽"], ["포켓몬스터", "포켓몬"], ["디지몬 어드벤처"], ["달의 요정 세일러문", "세일러문"],
  ["카드캡터 체리"], ["웨딩 피치", "웨딩피치"], ["천사소녀 네티"], ["피구왕 통키"], ["축구왕 슛돌이"], ["탑블레이드"],
  ["마루코는 아홉살", "마루코는 아홉 살"], ["아따맘마"], ["달빛천사"], ["꼬마버스 타요"],
  // ── 우리나라 애니 ──
  ["아기공룡 둘리", "둘리"], ["검정고무신"], ["뽀롱뽀롱 뽀로로", "뽀로로"], ["신비아파트"], ["안녕 자두야"], ["달려라 하니"],
  ["머털도사"], ["로보트 태권브이", "로봇 태권브이", "태권브이"], ["날아라 슈퍼보드"], ["헬로카봇"], ["터닝메카드"], ["라바"],
  ["신의 탑"], ["갓 오브 하이스쿨"], ["유미의 세포들"], ["나 혼자만 레벨업", "나혼렙"],
];

export const ANI_SECONDS = 60;
/** 하루 문제 수 (60초 안에 다 풀기 어려운 만큼) */
export const ANI_PER_DAY = 40;
/** 1회 (KST) */
export const ANI_START = "2026-11-05";

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** 한글 음절은 초성으로, 나머지(띄어쓰기·숫자·영문)는 그대로 ("진격의 거인" → "ㅈㄱㅇ ㄱㅇ") */
export function chosung(s: string): string {
  return [...s]
    .map((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)]! : ch;
    })
    .join("");
}

/** 답 비교용: 띄어쓰기·문장부호를 빼고 영문은 소문자 ("헌터 X 헌터!" → "헌터x헌터") */
export const normalizeAnswer = (s: string): string => s.normalize("NFC").toLowerCase().replace(/[\s.,!?·~:'"’‘“”()\-]/g, "");

/** 브라우저가 바로 정답 여부를 보여 주되 답을 그대로 싣지 않으려고 쓰는 짧은 지문 (FNV-1a 32비트) */
export function answerHash(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of normalizeAnswer(s)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** 시드가 같으면 늘 같은 순서 (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function aniDayNumber(day: string): number {
  return Math.max(0, Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${ANI_START}T00:00:00Z`)) / 86_400_000));
}

/** 그날 문제 순서 (전국 같음): 제목 번호 목록 */
export function aniDailyIndexes(day: string): number[] {
  const r = rng(2_654_435_761 + aniDayNumber(day) * 40_503);
  const a = ANI_TITLES.map((_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, ANI_PER_DAY);
}

export type AniQuestion = { cho: string; len: number; hashes: string[] };

/** 그날 문제 (정답 없이: 초성·글자 수·정답 지문만) */
export function aniDailyQuestions(day: string): AniQuestion[] {
  return aniDailyIndexes(day).map((i) => {
    const t = ANI_TITLES[i]!;
    return { cho: chosung(t[0]!), len: normalizeAnswer(t[0]!).length, hashes: t.map(answerHash) };
  });
}

/** 걸린 시간 상한·하한 */
export const ANI_MAX_MS = ANI_SECONDS * 1000;
export const ANI_MIN_MS = 1500;

/** 랭킹 점수: 맞힌 개수가 먼저, 같으면 마지막으로 맞힌 시각이 빠를수록 높다 */
export const aniEncode = (correct: number, lastMs: number): number => correct * 10_000 + (9_999 - Math.min(9_999, Math.floor(Math.max(0, lastMs) / 100)));
export const aniDecode = (score: number): { correct: number; tenths: number } => ({ correct: Math.floor(score / 10_000), tenths: 9_999 - (score % 10_000) });
export const ANI_SCORE_MAX = aniEncode(ANI_PER_DAY, 0);

export function formatAniScore(score: number): string {
  const { correct, tenths } = aniDecode(score);
  return correct ? `${correct}개 · ${(tenths / 10).toFixed(1)}초` : "0개";
}

/**
 * 채점: 그날 문제 순서대로 적은 답(건너뛴 건 빈 칸) → 맞힌 개수와 정답.
 * 답은 문제 순서대로 와야 하고, 60초 안에 맞힌 것만 친다(브라우저가 시간 안에 낸 것만 보낸다).
 */
export function gradeAni(day: string, answers: readonly string[]): { correct: number; results: { title: string; ok: boolean; mine: string }[] } {
  const idx = aniDailyIndexes(day);
  const results = answers.slice(0, idx.length).map((a, k) => {
    const t = ANI_TITLES[idx[k]!]!;
    const ok = !!a && t.some((x) => normalizeAnswer(x) === normalizeAnswer(a));
    return { title: t[0]!, ok, mine: a };
  });
  return { correct: results.filter((r) => r.ok).length, results };
}
