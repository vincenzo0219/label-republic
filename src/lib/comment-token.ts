/**
 * "내 것" 증표 — 쓴 브라우저만 가진 HMAC 증표로 알림·상태를 받는다.
 *
 * 답글·멘션 알림을 받을 "내 댓글" (Sprint 33): 댓글 번호는 화면에 공개(#c123)되므로 번호만으로 알림을 받게 하면 누구나
 * 남의 댓글에 달리는 답글을 따라다닐 수 있었다. 댓글을 쓸 때만 서버가 증표를 돌려주고, 리포트·푸시는 "번호.증표"만 받는다.
 * "내 제보" (Sprint 36): 제보의 자세한 내용·처리 상태를 쓴 브라우저에만 보여 줄 때 같은 방식을 쓴다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";

const TOKEN_LEN = 16;
const REF = /^(\d{1,18})\.([A-Za-z0-9_-]{16})$/;
export const COMMENT_REF = REF;

type Scope = "comment-notify" | "feedback";

function token(scope: Scope, id: string): string {
  return createHmac("sha256", config.appSecret).update(`${scope}:${id}`).digest("base64url").slice(0, TOKEN_LEN);
}

/** "번호.증표" 목록 → 증표가 맞는 번호만 (중복 제거, 최대 max) */
function verified(scope: Scope, refs: Iterable<string>, max: number): string[] {
  const out: string[] = [];
  for (const raw of refs) {
    const m = REF.exec(raw.trim());
    if (!m) continue;
    const want = Buffer.from(token(scope, m[1]!));
    const got = Buffer.from(m[2]!);
    if (want.length !== got.length || !timingSafeEqual(want, got) || out.includes(m[1]!)) continue;
    out.push(m[1]!);
    if (out.length >= max) break;
  }
  return out;
}

export function commentNotifyToken(id: string): string {
  return token("comment-notify", id);
}

export function commentRef(id: string): string {
  return `${id}.${commentNotifyToken(id)}`;
}

export function verifiedCommentIds(refs: Iterable<string>, max: number): string[] {
  return verified("comment-notify", refs, max);
}

export function feedbackRef(id: string): string {
  return `${id}.${token("feedback", id)}`;
}

export function verifiedFeedbackIds(refs: Iterable<string>, max: number): string[] {
  return verified("feedback", refs, max);
}
