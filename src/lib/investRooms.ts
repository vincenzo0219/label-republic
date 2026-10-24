/**
 * 💰 투자방 안전 규칙 (10/24, 적립식 투자방·미국주식방·주식). docs/promo/research-stock-realestate.md:
 * 리딩방(2024-08 시행 자본시장법 개정)·유사투자자문 유입을 막는다. 서버·클라이언트 공용 순수 함수.
 * - 외부 메신저·단체방 링크, 리딩방 모집 문구, 전화번호가 든 글·댓글은 올리지 않는다 (400)
 * - AI 운영은 이 방에서 수익 보장·유료 리딩·대가성 종목 추천도 가린다 (src/lib/abuse.ts)
 * - AI 큐레이터는 이 방에 글을 쓰지 않는다 (src/lib/jobs/curator.ts)
 */
export const SAVINGS_ROOM = "적립식-투자방";
export const US_STOCK_ROOM = "미국주식방";
/** 이용자가 만든 방 (id 139). 이름·설명·글은 그대로 두고 규칙과 탭만 */
export const STOCK_ROOM = "주식";

export const INVEST_ROOMS: ReadonlySet<string> = new Set([SAVINGS_ROOM, US_STOCK_ROOM, STOCK_ROOM]);
export const isInvestRoom = (slug: string | null | undefined): boolean => !!slug && INVEST_ROOMS.has(slug);

export const INVEST_NOTICE = "투자 판단은 본인 책임 · 종목 추천 안 함";

export const INVEST_ERRORS = {
  link: "투자방에는 외부 채팅방 링크를 올릴 수 없어요",
  leading: "투자방에는 리딩방 홍보를 올릴 수 없어요",
  phone: "투자방에는 전화번호를 올릴 수 없어요",
} as const;

const LINKS: RegExp[] = [
  /open\s*\.\s*kakao\s*\.\s*com|pf\s*\.\s*kakao\s*\.\s*com|qr\s*\.\s*kakao\s*\.\s*com/i,
  /(?<![a-z0-9])t\s*\.\s*me\s*\/|telegram\s*\.\s*(?:me|org|dog)|tg:\/\//i,
  /텔레\s*(?:그램)?\s*(?:방|채널|그룹|아이디|id|주소|링크|[:@])/i,
  /band\s*\.\s*us|밴드\s*(?:방|주소|링크|초대)/i,
  /discord(?:app)?\s*\.\s*(?:gg|com\s*\/\s*invite)|dsc\s*\.\s*gg/i,
  /line\s*\.\s*me\s*\//i,
];

const LEADING: RegExp[] = [
  /리\s*딩\s*방/,
  /오픈\s*채팅\s*(?:방)?\s*(?:으로\s*)?(?:들어|입장|참여|오세요|와요|초대|링크|주소)/,
  /단톡\s*(?:방)?\s*(?:으로\s*)?(?:들어|입장|참여|초대|오세요|와요)/,
  /카톡\s*(?:방|아이디|id)\s*(?:으로\s*)?(?:들어|입장|참여|초대|오세요|와요|[:@])/i,
  /(?:무료|vip|유료)\s*(?:종목\s*)?(?:추천|리딩|시그널)\s*방/i,
  /종목\s*추천\s*방/,
];

/** 휴대전화·지역번호·인터넷전화 (날짜·금액과 헷갈리지 않게 0으로 시작하는 번호만) */
const PHONE = /(?<![\d.,])(?:01[016789]|02|0[3-6][1-5]|070|050\d?|080)[-.\s)]{0,2}\d{3,4}[-.\s]?\d{4}(?![\d.,])/;

/** 투자방에 올릴 수 없는 내용이면 짧은 이유, 아니면 null. 다른 방은 언제나 null */
export function investProblem(slug: string | null | undefined, ...texts: (string | null | undefined)[]): string | null {
  if (!isInvestRoom(slug)) return null;
  const text = texts.filter(Boolean).join("\n").normalize("NFKC");
  if (LINKS.some((re) => re.test(text))) return INVEST_ERRORS.link;
  if (LEADING.some((re) => re.test(text))) return INVEST_ERRORS.leading;
  if (PHONE.test(text)) return INVEST_ERRORS.phone;
  return null;
}

/** AI 운영에 덧붙이는 투자방 기준 */
export const INVEST_MODERATION_PROMPT = `이 글은 투자 이야기 방에 올라왔습니다. 다음에 해당하면 category "invest" 로 판단합니다.
- 리딩방·유료방·VIP방 모집, 외부 채팅방·메신저로 데려가려는 글
- 수익 보장 주장 ("원금 보장", "수익률 n% 보장", "무조건 오른다", "손실 없음")
- 매매 신호·종목 추천을 돈 받고 판다는 글, 유료 강의·구독으로 종목을 알려 준다는 글
- 특정 종목을 사라·팔라고 다수에게 권유하며 대가나 시세 조종이 의심되는 글
본인의 매매 기록, 일정·제도·용어 설명, 질문, 사기 주의 경고는 none 입니다.`;
