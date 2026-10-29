/**
 * 🧹 올린 직후 바로 가릴 조롱·도배성 글 (10/29 대표님 "입력은 되고 바로 가림", 넣어둬 정치 도배 사건).
 * 쓴 사람에게는 그대로 보이고 다른 사람에게만 안 보인다(shadow). 운영자가 /admin 에서 한 번에 풀 수 있다.
 * 정치 이야기 자체는 막지 않는다: 짧은 글에서 정치인 이름 + 조롱·명령조, 정상 이름 ♥ 짝짓기, 노방장 조롱, 뜻 없는 자판 두드리기만.
 * 오탐이 놓치는 것보다 나쁘다 — 애매하면 걸지 않는다.
 */
import type { AbuseVerdict } from "./abuse";

export const TROLL_MODEL = "troll-rules-v1";

const LEADERS = [
  "윤석열", "이재명", "문재인", "박근혜", "이명박", "노무현", "김대중", "김영삼", "노태우", "전두환", "박정희",
  "한동훈", "김건희", "조국", "이준석", "김정은", "김정일", "김일성", "시진핑", "트럼프", "바이든", "푸틴", "아베", "기시다", "오바마",
];
const LEADER = `(?:${LEADERS.join("|")})`;
const MOCK = "(?:하야\\s*(?:하|해)\\s*라|돌려\\s*(?:내|놔)|꺼\\s*져|죽\\s*어\\s*라|뒈\\s*져|감옥\\s*(?:가|보내)|사형\\s*(?:시켜|해\\s*라)|망해\\s*라|탄핵\\s*(?:하|해)\\s*라|빨갱이|좌빨|수꼴|토착\\s*왜구|매국노|개[새세]\\s*[끼기])";
const HEART = "[♥♡❤💕💘💞]\\uFE0E?\\uFE0F?";

const LEADER_MOCK = new RegExp(`${LEADER}[^\\n]{0,20}${MOCK}|${MOCK}[^\\n]{0,10}${LEADER}`);
const LEADER_PAIR = new RegExp(`${LEADER}\\s*${HEART}\\s*${LEADER}`);
const OPERATOR_MOCK = /노방장\s*(?:은|는|이|아|놈|새끼|넘)?[^\n]{0,12}(?:돌려\s*(?:내|놔)|꺼\s*져|망해|사기꾼|쓰레기|병신|ㅂㅅ|죽어|ㅗ)/;

/** 리액션으로 흔한 자모 (ㅋㅋ ㅎㅎ ㅠㅠ ㅜㅜ ㄷㄷ ㄱㄱ ㅇㅇ ㅊㅋ ㅅㄱ) — 이것만으로는 걸지 않는다 */
const REACTION_JAMO = /^[ㅋㅎㅠㅜㄷㄱㅇㅊㅅ]+$/;

/** 짧은 글일 때만 정치인+조롱을 본다 (긴 글은 토론일 수 있음) */
const SHORT = 80;

/**
 * kind: "comment" 면 ㅋㅋㅋ 같은 반응 한 줄은 통과 (수다방·댓글에서 흔함). 글·넣어둬 제목이 ㅋㅋㅋ 뿐이면 건다.
 */
export function trollCheck(texts: (string | null | undefined)[], opts: { comment?: boolean } = {}): AbuseVerdict | null {
  const text = texts.filter(Boolean).join("\n").normalize("NFC").trim();
  if (!text) return null;
  const hit = (evidence: string): AbuseVerdict => ({ category: "troll", evidence: evidence.slice(0, 40), model: TROLL_MODEL });
  const pair = LEADER_PAIR.exec(text);
  if (pair) return hit(pair[0]);
  const op = OPERATOR_MOCK.exec(text);
  if (op) return hit(op[0]);
  if (text.length <= SHORT) {
    const m = LEADER_MOCK.exec(text);
    if (m) return hit(m[0]);
  }
  const compact = text.replace(/[\s\p{P}\p{S}\d]/gu, "");
  if (compact.length >= 6 && /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(compact)) {
    if (!REACTION_JAMO.test(compact)) return hit(compact);
    if (!opts.comment && /^[ㅋㅎ]+$/.test(compact) && compact.length >= 6) return hit(compact);
  }
  if (compact.length >= 10 && /^(.)\1+$/u.test(compact) && !REACTION_JAMO.test(compact)) return hit(compact);
  if (/^(?:asdf|qwer|zxcv|fdsa|sdfg|wasd|jkl)+[a-z]*$/i.test(compact) && compact.length >= 6) return hit(compact);
  return null;
}
