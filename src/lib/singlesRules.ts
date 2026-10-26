/**
 * 💌 미혼남녀 만남 행사 방 안전 규칙 (10/26, 098). 결혼중개업법·청소년보호법: 노방장은 행사 정보만 모으고 사람을 잇지 않는다.
 * - 글·댓글·💬 채팅에서 연락처·SNS 아이디 주고받기를 거절한다 (400, 서버·클라이언트 공용 순수 함수)
 * - 갈 거예요·같이 가요·조 짜기·정모 참가는 categories.no_matching 으로 서버에서 막는다 (src/lib/repo/infoOnly.ts)
 */
import { MESSENGER_LINKS, PHONE } from "./investRooms";
import { SINGLES_ROOM } from "./singlesEvents";

/** 연락처 규칙을 쓰는 방 */
export const CONTACT_RULE_ROOMS: ReadonlySet<string> = new Set([SINGLES_ROOM]);
export const hasContactRule = (slug: string | null | undefined): boolean => !!slug && CONTACT_RULE_ROOMS.has(slug);

export const CONTACT_ERROR = "이 방에서는 연락처·SNS 아이디를 주고받을 수 없어요";
/** 글쓰기·댓글·채팅 위 안내 한 줄 */
export const SINGLES_RULE_NOTICE = "만 19세 이상 · 연락처·SNS 교환, 만남 주선, 금전 요구는 금지예요. 이상하면 🚩 신고해 주세요.";
export const roomRuleNotice = (slug: string | null | undefined): string | null => (hasContactRule(slug) ? SINGLES_RULE_NOTICE : null);

const SNS = String.raw`(?:인스타(?:\s*그램)?|insta(?:gram)?|(?<![a-z])ig(?![a-z])|트위터|twitter|스레드|threads|페북|페이스북|facebook|틱톡|tiktok|라인|(?<![a-z])line(?![a-z])|텔레(?:\s*그램)?|telegram|위챗|wechat|스냅(?:\s*챗)?|snapchat|디코|디스코드|discord)`;
const KAKAO = String.raw`(?:카카오\s*톡?|카톡|캌톡|kakao\s*(?:talk)?|(?<![ㄱ-ㅎ])ㅋㅌ(?![ㄱ-ㅎ]))`;

const CONTACT: RegExp[] = [
  // 전화번호: 숫자 그대로 · 띄어 쓴 숫자 · 한글로 쓴 숫자 (공일공 일이삼사…)
  PHONE,
  /(?<!\d)0\s*1\s*[016789](?:\s*[-.)]?\s*\d){7,8}(?!\s*\d)/,
  /(?:공|영)\s*일\s*(?:공|영|일|육|칠|팔|구)(?:\s*[-.]?\s*[공영일이삼사오육륙칠팔구]){7,8}/,
  // 이메일 (골뱅이·닷으로 바꿔 써도)
  /(?<![\w.+-])[\w.+-]{1,64}\s*(?:@|골뱅이|\(at\)|\[at\])\s*[\w-]{1,63}(?:\s*(?:\.|닷|\(dot\))\s*[\w-]{1,63})+/i,
  /(?:naver|gmail|daum|hanmail|kakao|nate|icloud|outlook|hotmail)\s*(?:\.|닷)\s*(?:com|net)/i,
  // 오픈채팅·텔레그램·밴드·디스코드·라인 링크 (투자방과 같은 목록)
  ...MESSENGER_LINKS,
  // SNS 주소
  /(?:instagram|facebook|twitter|tiktok|threads)\s*\.\s*(?:com|net)|instagr\s*\.\s*am|fb\s*\.\s*me|(?<![a-z0-9])x\s*\.\s*com\s*\//i,
  // SNS·카톡 아이디 주고받기
  new RegExp(`${SNS}\\s*(?:아이디|아뒤|id|계정|주소|팔로우|맞팔|선팔|친추|dm|디엠|[:@])`, "i"),
  new RegExp(`${KAKAO}\\s*(?:아이디|아뒤|id|친추|친구\\s*추가|주소|[:@]|으로|로\\s*(?:연락|와|오|보내)|주세요|줘|해요|하실|할래|교환|드릴|알려|프로필|플친|방)`, "i"),
  /오픈\s*(?:채팅|톡|챗)|오카방|갠톡|개인\s*톡|갠\s*메|개인\s*메시지|따로\s*(?:연락|톡|카톡|만나)/,
  // DM·쪽지
  /(?<![a-z])dm(?![a-z])|디엠|쪽지\s*(?:주세요|줘|드릴|드려|보내|할게|해요|주실)/i,
  // 연락처·번호 달라는 말
  /(?:연락처|전화\s*번호|폰\s*번호|핸드폰\s*번호|휴대폰\s*번호|전번|폰번|번호|아이디|(?<![a-z])id(?![a-z]))\s*(?:를|을|좀|도|라도|는|은)?\s*(?:좀\s*)?(?:주세|주실|줘|주라|알려|교환|남겨|드릴|드려|보내|공유|달라|따|물어|적어|올려)/i,
  /연락처\s*(?:교환|공유|주고)|연락\s*(?:주세요|줘요|주실|드릴|드려요|할게요|하실\s*분|해요|하자|주라|해\s*(?:주세요|줘))/,
];

/** 인스타 이야기와 함께 쓴 @아이디 (댓글 @닉네임 멘션은 그대로 둔다) */
const SNS_WORD = new RegExp(SNS, "i");
const HANDLE = /(?<![\w.])@[a-z0-9._]{2,30}(?![\w])/i;

/** 이 방에 올릴 수 없는 연락처·SNS 아이디가 있으면 이유, 아니면 null. 규칙이 없는 방은 언제나 null */
export function contactProblem(slug: string | null | undefined, ...texts: (string | null | undefined)[]): string | null {
  if (!hasContactRule(slug)) return null;
  const text = texts.filter(Boolean).join("\n").normalize("NFKC").replace(/[​-‍⁠﻿]/g, "");
  if (CONTACT.some((re) => re.test(text))) return CONTACT_ERROR;
  if (SNS_WORD.test(text) && HANDLE.test(text)) return CONTACT_ERROR;
  return null;
}
