/**
 * 정보만 보여 주는 방 (categories.info_only, 092). 💌 미혼남녀 만남 행사 방이 첫 사례.
 * 사람과 사람을 잇는 기능(글쓰기·댓글·방 채팅·갈 거예요·같이 가요·조 짜기·정모 참가)을 화면뿐 아니라 저장소에서 거절한다.
 */
import type { PoolClient } from "pg";
import { query } from "../db";
import { HttpError } from "../errors";

export const INFO_ONLY_MESSAGE = "이 방은 행사 정보만 모아 보여 줘요. 글쓰기·댓글·동행 기능은 쓸 수 없어요.";
export const infoOnlyError = () => new HttpError(403, "info_only_room", INFO_ONLY_MESSAGE);

type Q = Pick<PoolClient, "query"> | undefined;
const run = async <T extends Record<string, unknown>>(c: Q, sql: string, args: unknown[]): Promise<T[]> =>
  c ? (await c.query<T>(sql, args)).rows : query<T>(sql, args);

export async function isInfoOnlyRoom(slug: string, c?: Q): Promise<boolean> {
  const [r] = await run<{ info_only: boolean }>(c, "SELECT info_only FROM categories WHERE slug = $1", [slug]);
  return !!r?.info_only;
}

/** 글이 정보 전용 방에 있으면 거절 (없는 글은 그냥 지나간다: 각 기능이 알아서 404) */
export async function assertPostInteractive(postId: string, c?: Q): Promise<void> {
  if (!/^\d{1,18}$/.test(postId)) return;
  const [r] = await run<{ info_only: boolean }>(
    c,
    "SELECT c.info_only FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.id = $1",
    [postId],
  );
  if (r?.info_only) throw infoOnlyError();
}

/** 동행 모집(조)이 정보 전용 방 글에 달려 있으면 거절 */
export async function assertGroupInteractive(groupId: string, c?: Q): Promise<void> {
  if (!/^\d{1,18}$/.test(groupId)) return;
  const [r] = await run<{ info_only: boolean }>(
    c,
    "SELECT c.info_only FROM event_groups g JOIN posts p ON p.id = g.post_id JOIN categories c ON c.id = p.category_id WHERE g.id = $1",
    [groupId],
  );
  if (r?.info_only) throw infoOnlyError();
}
