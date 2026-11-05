/**
 * 🧩 방 놀이 탭 (11/2 대표님 "전부 탭 새로 추가해서 전부 다 진행"). 방마다 ?tab=play 에 보이는 것들.
 * - test: 새 타입 테스트 (src/lib/typeTests, 주소 /t/<key>). 탭 안에서 바로 한다
 * - link: 이미 있는 테스트·게임으로 가는 카드 (duel: 🤝 친구 대결 링크가 있는 것, mate: 💞 궁합 링크가 있는 것)
 * - savings: 💰 적립 습관 카드 (원금 계산) · bookTaste: 📚 행사 책 취향 테이블 (모은 숫자만)
 * - board: 🧩 2단계 놀이판 (기록판·주간 사진 투표·살까 말까·매일 퀴즈·별점판·달력, 설정은 src/lib/roomBoards.ts)
 * - going: 🙋 이번 주 [행사] 글 갈 거예요 · rank: 🏆 이번 주 순위 (랠리 탭·코스피 맞히기, 월요일 초기화)
 * 테스트 질문은 여기서 불러오지 않는다 (방 탭 목록이 가볍게 쓰려고)
 */
export const PLAY_TAB = "play";
export const PLAY_LABEL = "🧩 놀이";

export type PlayItem =
  | { kind: "test"; key: string }
  | { kind: "link"; href: string; emoji: string; title: string; sub: string; duel?: boolean; mate?: boolean; adult?: boolean }
  | { kind: "savings" }
  | { kind: "bookTaste" }
  | { kind: "quiz" } // 🧩 오늘의 1분 퀴즈를 방 맨 위 대신 놀이 탭에 (11/2 대표님, 책 덕후방)
  | { kind: "board"; key: string }
  | { kind: "going" }
  | { kind: "rank"; game: "rally" | "kospi" };

const link = (href: string, emoji: string, title: string, sub: string, extra: Partial<Extract<PlayItem, { kind: "link" }>> = {}): PlayItem => ({ kind: "link", href, emoji, title, sub, ...extra });
const test = (key: string): PlayItem => ({ kind: "test", key });
const board = (key: string): PlayItem => ({ kind: "board", key });

export const ROOM_PLAY: Record<string, readonly PlayItem[]> = {
  // 📖 첫 문장 맞히기 (11/4 대표님 "책방도 책 게임으로 전국 랭킹"): 예전 10문제 첫 문장 테스트 자리를 하루 10문제·전국 랭킹 게임으로
  "읽는-책-제목을-교환해-보자": [link("/games/booksent?from=play&go=1", "📖", "오늘의 첫 문장 맞히기", "하루 10문제 · 전국 랭킹", { duel: true }), board("book-pages"), test("book-sentence"), { kind: "quiz" }, link("/games/rank?game=booksent", "🏆", "전국 랭킹", "오늘·이번 주·전체 순위")],
  "kbo-덕후방": [test("kbo-team"), link("/kbo-test", "⚾", "야구 팬 타입 테스트", "직관 응원단? 기록 분석가?")],
  "러닝-덕후방": [board("run-km"), link("/run-test", "🏃", "러너 타입 테스트", "새벽 혼런러? 크루 러너? 기록 사냥꾼? 풍경 산책러?")],
  "커피-덕후방": [board("coffee-cups"), board("coffee-vote"), link("/coffee-test", "☕", "커피 타입 테스트", "아아 직진파? 핸드드립 탐험가? 달달 라떼파?"), link("/games/latte?from=play", "☕", "라떼아트 따르기", "다른 사람 기록에 도전"), link("/games/rank?game=latte", "🏆", "전국 랭킹", "오늘·이번 주·전체 순위")],
  "뮤지컬-연극-덕후방": [board("stage-seen"), test("stage")],
  "팝업-전시-덕후방": [{ kind: "going" }, test("popup")],
  "보드게임-방탈출-덕후방": [board("escape-log"), test("boardgame")],
  "고양이-집사방": [board("cat-photo"), test("cat")],
  "반려견-덕후방": [board("dog-days"), link("/dog-test", "🐶", "견주 타입 테스트", "산책왕? 성분표 박사?")],
  "다이어트-식단-함께해요": [test("diet")],
  "캠핑-덕후방": [board("camping-region"), test("camping")],
  "요가-필라테스-덕후방": [board("yoga-mat"), link("/yoga-test", "🧘", "요가·필라테스 타입 테스트", "코어 집중러? 힐링 수련러? 요가템 수집가?")],
  주식: [{ kind: "rank", game: "kospi" }, test("stock-life"), link("/margin-calc", "🧮", "반대매매 계산기", "담보 비율 계산")],
  미국주식방: [test("us-night")],
  "적립식-투자방": [board("savings-done"), { kind: "savings" }],
  "육아-덕후방": [link("/c/육아-덕후방?tab=near", "📍", "이번 주 동네 체험", "새 프로그램은 알림으로 받아요"), link("/parent-test", "👶", "육아 스타일 테스트", "꼼꼼 정보러? 기록 장인? 나들이 대장?")],
  "와인-위스키-덕후방": [board("wine-note"), link("/wine-test", "🍷", "맛 취향 테스트", "묵직 레드파? 스모키 피트파? 만 19세 이상만 해 주세요", { adult: true })],
  // 🎨 애니 제목 초성 60초 (11/4 대표님 "책·애니·K리그로 진행해"): 하루 한 판 · 전국 랭킹을 맨 앞에
  "애니-만화-덕후방": [link("/games/anichosung?from=play&go=1", "🎨", "오늘의 애니 제목 초성", "60초 · 전국 랭킹", { duel: true }), board("anime-stars"), link("/anime-test", "🎨", "덕질 타입 테스트", "굿즈 수집가? 정주행 시청파? 원작 만화파?"), link("/games/rank?game=anichosung", "🏆", "전국 랭킹", "오늘·이번 주·전체 순위")],
  "드라마-덕후방": [link("/drama-test", "📺", "드라마 타입 테스트", "정주행 몰아보기파? 본방 사수파? 명대사 수집파?")],
  "신발-덕후방": [board("shoe-photo"), board("shoe-vote"), link("/shoe-test", "👟", "신발 타입 테스트", "데일리 컴포트파? 드로우 사냥꾼? 클린 콜렉터?")],
  "게임-덕후방": [link("/game-test", "🎮", "게임 타입 테스트", "랭크 올인파? 밤샘 스토리파? 친구랑 파티파?"), link("/games/reaction?from=play", "⚡", "반응속도 결투", "초록 되면 바로 탭", { duel: true }), link("/games/rank?game=reaction", "🏆", "전국 랭킹", "오늘·이번 주·전체 순위")],
  "비건-덕후방": [board("vegan-quiz"), link("/vegan-test", "🌱", "채식 타입 테스트", "플렉시테리언부터 비건까지 나의 채식 타입")],
  "비바리움-덕후방": [board("viv-photo"), link("/vivarium-test", "🦎", "첫 생물 고르기", "나에게 맞는 첫 생물은?"), link("/viv-test", "🌿", "비바리움 타입 테스트", "레이아웃 장인? 관찰 기록파?")],
  작가지망생방: [link("/writer-test", "✍️", "장르 테스트", "판타지? 로판? 무협? 나에게 맞는 장르")],
  "perfume-audio": [link("/ear-test", "🎧", "황금귀 테스트", "음질 차이 맞히기", { duel: true }), link("/hearing-test", "🔊", "고음 청력 테스트", "내 귀는 몇 kHz까지 들릴까?")],
  // 🏟️ 구단·홈구장 짝 맞추기 (11/4): 하루 한 판 · 전국 랭킹을 맨 앞에
  "k리그-덕후방": [link("/games/kmatch?from=play&go=1", "🏟️", "오늘의 구단·홈구장 짝 맞추기", "6쌍 · 전국 랭킹", { duel: true }), link("/fan-test", "⚽", "K리그 팬 테스트", "나는 어떤 축구 팬?", { mate: true }), link("/games/pk?from=play&go=1", "🥅", "승부차기 대결", "다른 사람 골 수에 도전"), link("/games/rank?game=kmatch", "🏆", "전국 랭킹", "오늘·이번 주·전체 순위")],
  "미혼남녀-만남-행사": [
    link("/love-test", "💘", "연애 성향 테스트", "1분, 나의 연애 스타일", { mate: true }),
    link("/games/worldcup?from=play", "💘", "이상형 월드컵", "따뜻한 성격·습관 16장"),
    link("/some-sim?start=1", "💬", "썸 시뮬레이터", "소개팅 다음 날 카톡, 1분이면 썸 날씨"),
    { kind: "bookTaste" },
  ],
  "테니스-덕후방": [{ kind: "rank", game: "rally" }, link("/ntrp-test", "🎾", "NTRP 자가진단", "1분 실력 등급", { duel: true }), link("/games/rally?from=play", "🎾", "랠리 탭", "몇 번 이어 받을 수 있을까?"), link("/games/rank?game=rally", "🏆", "전국 랭킹", "오늘·이번 주·전체 순위")],
  "ai-덕후방": [link("/ai-test", "🤖", "AI 판별 테스트", "진짜 시인의 문장과 AI 문장 골라내기")],
  "ai-밸런스-토론방": [link("/debate-test", "⚖️", "토론 스타일 테스트", "논리파? 중재파? 승부사?")],
  keyboards: [link("/typing-test", "⌨️", "한글 타자 테스트", "1분 타수 재기", { duel: true })],
  "pet-food": [link("/dog-test", "🐶", "견주 타입 테스트", "산책왕? 성분표 박사?"), link("/t/cat", "🐱", "냥이 성격 테스트", "집사가 답하는 우리 냥이 성격")],
  "오늘도-장사중": [board("shop-vote")],
  "요가-필라테스-강사방": [link("/posture-check", "📸", "자세 체크", "사진 2장으로 보는 자세 (브라우저 안에서만)")],
};

export const isPlayRoom = (slug: string) => Object.hasOwn(ROOM_PLAY, slug);
export const playItems = (slug: string): readonly PlayItem[] => ROOM_PLAY[slug] ?? [];

/** 💰 적립 습관 카드: 매달 넣는 돈 × 개월 (수익 가정 없이 원금만) */
export const SAVINGS_MONTHS = [12, 36, 60] as const;
export function savingsPrincipal(monthly: number): { months: number; total: number }[] {
  const m = Number.isFinite(monthly) ? Math.max(0, Math.min(100_000_000, Math.floor(monthly))) : 0;
  return SAVINGS_MONTHS.map((months) => ({ months, total: m * months }));
}
export const wonText = (n: number) => `${Math.max(0, Math.floor(n)).toLocaleString("ko-KR")}원`;
