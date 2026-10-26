/**
 * 방에서 쓸 수 없는 기능을 화면뿐 아니라 저장소에서 거절한다.
 * - 정보만 보여 주는 방 (categories.info_only, 092): 글쓰기·댓글·방 채팅·동행 기능 모두 없음
 * - 만남 연결 기능 없는 방 (categories.no_matching, 098, 💌 미혼남녀 만남 행사): 글·댓글·채팅은 되고
 *   사람과 사람을 잇는 기능(갈 거예요·같이 가요·조 짜기·자동 조·정모 제안과 참가)만 거절 (결혼중개업법·청소년보호법)
 */
import type { PoolClient } from "pg";
import { query } from "../db";
import { HttpError } from "../errors";

export const INFO_ONLY_MESSAGE = "이 방은 행사 정보만 모아 보여 줘요. 글쓰기·댓글·동행 기능은 쓸 수 없어요.";
export const infoOnlyError = () => new HttpError(403, "info_only_room", INFO_ONLY_MESSAGE);
export const NO_MATCHING_MESSAGE = "이 방에서는 같이 가기·조 짜기·정모 같은 만남 연결 기능을 쓸 수 없어요.";
export const noMatchingError = () => new HttpError(403, "no_matching_room", NO_MATCHING_MESSAGE);

type Flags = { info_only: boolean; no_matching: boolean };
/** 동행·조·정모를 막아야 하면 그 오류 (정보 전용 방이 먼저) */
export const matchingError = (r: Partial<Flags> | undefined): HttpError | null =>
  r?.info_only ? infoOnlyError() : r?.no_matching ? noMatchingError() : null;

type Q = Pick<PoolClient, "query"> | undefined;
const run = async <T extends Record<string, unknown>>(c: Q, sql: string, args: unknown[]): Promise<T[]> =>
  c ? (await c.query<T>(sql, args)).rows : query<T>(sql, args);

export async function isInfoOnlyRoom(slug: string, c?: Q): Promise<boolean> {
  return !!(await roomFlags(slug, c))?.info_only;
}

export async function roomFlags(slug: string, c?: Q): Promise<Flags | null> {
  const [r] = await run<Flags>(c, "SELECT info_only, no_matching FROM categories WHERE slug = $1", [slug]);
  return r ?? null;
}

/** 글이 동행·정모를 쓸 수 없는 방에 있으면 거절 (없는 글은 그냥 지나간다: 각 기능이 알아서 404) */
export async function assertPostInteractive(postId: string, c?: Q): Promise<void> {
  if (!/^\d{1,18}$/.test(postId)) return;
  const [r] = await run<Flags>(
    c,
    "SELECT c.info_only, c.no_matching FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.id = $1",
    [postId],
  );
  const err = matchingError(r);
  if (err) throw err;
}

/** 동행 모집(조)이 그런 방 글에 달려 있으면 거절 */
export async function assertGroupInteractive(groupId: string, c?: Q): Promise<void> {
  if (!/^\d{1,18}$/.test(groupId)) return;
  const [r] = await run<Flags>(
    c,
    "SELECT c.info_only, c.no_matching FROM event_groups g JOIN posts p ON p.id = g.post_id JOIN categories c ON c.id = p.category_id WHERE g.id = $1",
    [groupId],
  );
  const err = matchingError(r);
  if (err) throw err;
}
