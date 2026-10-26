/** 🙋 조 채팅 연락처 가림 (10/26, 서버 전용: abuse.ts 를 쓴다) */
import { heuristicAbuse, maskPersonalInfo, PERSONAL_INFO_MASK } from "./abuse";

const CONTACT = [
  /https?:\/\/(?:open\.kakao\.com|t\.me|telegram\.me|pf\.kakao\.com)\/\S*/gi,
  /(?<![\w.])(?:open\.kakao\.com|t\.me)\/\S*/gi,
  /(?:카톡|카카오톡|카카오|라인|텔레그램|텔레|인스타|insta(?:gram)?|kakao)\s*(?:id|아이디|ID|계정|디엠|dm)?\s*[:：]?\s*@?[A-Za-z0-9_.]{3,30}/gi,
  // 01x 이 아닌 일반 전화번호(02-123-4567, 070-1234-5678)도
  /(?<!\d)0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}(?!\d)/g,
];

/**
 * 조 채팅 한 줄: 휴대전화·이메일·주민번호(maskPersonalInfo) + 오픈채팅·텔레그램 주소·메신저 아이디·일반 전화번호를 가린다.
 * 욕설·혐오·위협은 아예 보내지 않는다(reject).
 */
export function cleanChat(text: string): { text: string; masked: boolean; reject: string | null } {
  const v = heuristicAbuse(text);
  if (v && v.category !== "personal_info") return { text, masked: false, reject: "이 말은 보낼 수 없어요." };
  let out = maskPersonalInfo(text).text;
  for (const re of CONTACT) out = out.replace(re, PERSONAL_INFO_MASK);
  return { text: out, masked: out !== text, reject: null };
}

