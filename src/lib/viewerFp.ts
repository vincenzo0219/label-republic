import { headers } from "next/headers";
import { fingerprint } from "./fingerprint";

/** 서버 화면에서 지금 보는 사람의 지문 (쓴 사람에게만 보이는 🧹 가린 댓글용, 10/29) */
export async function viewerFp(): Promise<string> {
  return fingerprint(await headers());
}
