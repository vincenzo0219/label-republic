/**
 * 답글·멘션 알림을 받을 "내 댓글" 증표 (Sprint 33).
 *
 * 댓글 번호는 화면에 공개(#c123)되므로 번호만으로 알림을 받게 하면 누구나 남의 댓글에 달리는 답글을 따라다닐 수 있었다.
 * 댓글을 쓸 때만 서버가 HMAC 증표를 돌려주고, 리포트·푸시는 "번호.증표"만 받는다 — 증표는 쓴 브라우저만 가진다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";

const TOKEN_LEN = 16;
export const COMMENT_REF = /^(\d{1,18})\.([A-Za-z0-9_-]{16})$/;

export function commentNotifyToken(id: string): string {
  return createHmac("sha256", config.appSecret).update(`comment-notify:${id}`).digest("base64url").slice(0, TOKEN_LEN);
}

export function commentRef(id: string): string {
  return `${id}.${commentNotifyToken(id)}`;
}

/** "번호.증표" 목록 → 증표가 맞는 댓글 번호만 (중복 제거, 최대 max) */
export function verifiedCommentIds(refs: Iterable<string>, max: number): string[] {
  const out: string[] = [];
  for (const raw of refs) {
    const m = COMMENT_REF.exec(raw.trim());
    if (!m) continue;
    const want = Buffer.from(commentNotifyToken(m[1]!));
    const got = Buffer.from(m[2]!);
    if (want.length !== got.length || !timingSafeEqual(want, got) || out.includes(m[1]!)) continue;
    out.push(m[1]!);
    if (out.length >= max) break;
  }
  return out;
}
