/**
 * 🔔 사람 글·댓글 알림 (10/25, 대표님 요청 "사람이 글쓰면 즉각 알려줘") — 판단·문구만 (DB 는 repo/ownerAlert.ts).
 * 사람 = 브라우저 지문(fingerprint)이 있고, AI 큐레이터가 아니고, 운영 닉네임이 아닌 글.
 * 운영 초안·환영 답글·큐레이터·에이전트는 지문 없이 쓰거나 is_ai_curated 라 빠진다.
 */
import type { PushMessage } from "./push";
import { OPERATOR_NICKS } from "./repo/metrics";

export type OwnerAlertKind = "post" | "comment" | "gig";
export type OwnerWrite = { kind: OwnerAlertKind; nickname: string; fingerprint?: string | null; isAiCurated?: boolean };
export type OwnerAlertItem = { id: string; kind: OwnerAlertKind; room: string; nickname: string; excerpt: string; url: string };

/** 한 기기에 이 간격에 한 번까지 — 그 사이 글은 모였다가 "새 글·댓글 N개" 로 */
export const OWNER_ALERT_GAP_MS = 60_000;
const NOT_HUMAN = new Set([...OPERATOR_NICKS, "AI 큐레이터"]);

export function isHumanWrite(w: OwnerWrite): boolean {
  return !!w.fingerprint && !w.isAiCurated && !NOT_HUMAN.has(w.nickname.trim());
}

/** 공백을 줄이고 앞 n 글자 */
export function excerpt(text: string, n = 40): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** 지금 보내도 되면 0, 아니면 남은 ms */
export function ownerAlertWait(lastSentAt: Date | null, now: Date, gapMs = OWNER_ALERT_GAP_MS): number {
  if (!lastSentAt) return 0;
  return Math.max(0, lastSentAt.getTime() + gapMs - now.getTime());
}

const LABEL: Record<OwnerAlertKind, string> = { post: "새 글", comment: "댓글", gig: "대강·구인" };

/** 한 건이면 누가 어디에 무엇을, 여러 건이면 개수와 앞의 두 건. 누르면 가장 최근 글로 */
export function ownerAlertMessage(items: OwnerAlertItem[]): PushMessage {
  const last = items[items.length - 1]!;
  const tag = `lr-owner-${last.id}`;
  if (items.length === 1)
    return { title: `✍️ ${LABEL[last.kind]} · ${last.room} · ${last.nickname}`.slice(0, 80), body: last.excerpt, url: last.url, tag };
  const kinds = new Set(items.map((i) => i.kind));
  const what = kinds.size === 1 ? LABEL[last.kind].replace("새 ", "") : "글·댓글";
  return {
    title: `✍️ 새 ${what} ${items.length}개`,
    body: items.slice(-2).reverse().map((i) => `${i.nickname}: ${i.excerpt}`).join(" / "),
    url: last.url,
    tag,
  };
}
