/** 💳 넣어둬 서버 화면: 쿠키의 방문자 → 해시 (쿠키가 없으면 아무 글의 주인도 아닌 값) */
import { cookies } from "next/headers";
import { VISITOR_COOKIE, visitorHash } from "./metrics";

export async function pageVisitor(): Promise<string> {
  const vid = (await cookies()).get(VISITOR_COOKIE)?.value;
  return vid && /^[0-9a-f-]{36}$/.test(vid) ? visitorHash(vid) : "-";
}
