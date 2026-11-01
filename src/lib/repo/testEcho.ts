/**
 * 🧪 테스트 결과를 그 방 💬 수다방에도 한 줄로 (11/1 대표님 "테스트 결과를 그 방 수다방에도 자동으로 보여 주기").
 * 사람이 테스트 결과 글에 남긴 결과 댓글(맨 위 댓글)만, 그 글이 있는 방 수다방에 "🧪 수진님 결과 · ⚽ 축구 팬 테스트: 🚌 원정 직관러" 로 흐른다.
 * 진짜 사람이 남긴 결과를 옮기는 것뿐이라 지어낸 말이 아니다. 이름은 수다방 안내 이름(💬 수다방)이고 지문이 없어 자동 환영 답글·사람 글 집계에서 빠진다.
 */
import { query } from "../db";
import { reportError } from "../error-tracking";
import { TEST_POST_IDS } from "../testPosts";
import { ensureRoomChat } from "./roomChat";

export const ECHO_NAME = "💬 수다방";
const ECHO_MAX = 140;

/** 수다방에 올릴 한 줄. 결과 댓글 첫 줄을 그대로 쓰고 길면 줄인다 */
export function echoLine(nickname: string, body: string): string {
  const first = body.split("\n").map((s) => s.trim()).find(Boolean) ?? "";
  const line = `🧪 ${nickname.trim()}님 결과 · ${first}`;
  return [...line].length > ECHO_MAX ? `${[...line].slice(0, ECHO_MAX - 1).join("")}…` : line;
}

export function shouldEcho(postId: string, c: { parentId?: string | null; fingerprint?: string | null }): boolean {
  return TEST_POST_IDS.has(postId) && !c.parentId && !!c.fingerprint;
}

/** 결과 글이 있는 방의 수다방에 한 줄. 결과 글 자체가 수다방이면(💌 만남 행사 채팅 글) 하지 않는다. 실패해도 조용히 */
export async function echoTestResult(postId: string, commentId: string): Promise<string | null> {
  try {
    // 가려진 댓글(욕설·도배·조롱 등)은 옮기지 않는다
    const [p] = await query<{ slug: string; nickname: string; body: string }>(
      `SELECT cat.slug, c.nickname, c.body FROM comments c JOIN posts p ON p.id = c.post_id JOIN categories cat ON cat.id = p.category_id
        WHERE c.id = $1 AND c.post_id = $2 AND c.parent_id IS NULL AND c.ai_hidden_at IS NULL AND NOT p.is_blinded`,
      [commentId, postId],
    );
    if (!p) return null;
    const chat = await ensureRoomChat(p.slug);
    if (!chat || chat.postId === postId) return null;
    const [row] = await query<{ id: string }>(
      `INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, $2, 'test-echo', $3) RETURNING id::text`,
      [chat.postId, ECHO_NAME, echoLine(p.nickname, p.body)],
    );
    return row?.id ?? null;
  } catch (err) {
    reportError(err, { kind: "job", where: "test-echo" });
    return null;
  }
}
