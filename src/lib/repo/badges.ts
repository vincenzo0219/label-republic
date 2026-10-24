/** 방 배지 조회·저장 (10/24). 사람 = 닉네임 (nickname_claims 와 같은 키) */
import { identityKey, ROOM_BADGES, TEST_RESULT_KEYS, type BadgeMap } from "../badges";
import { query } from "../db";

/** 테스트 결과 저장 (사람마다 마지막 결과). 모르는 테스트·결과면 false */
export async function saveTestResult(test: string, nickname: string, result: string): Promise<boolean> {
  if (!TEST_RESULT_KEYS[test]?.has(result)) return false;
  const key = identityKey(nickname);
  if (!key) return false;
  await query(
    `INSERT INTO test_results (test_key, author_key, result_key) VALUES ($1, $2, $3)
     ON CONFLICT (test_key, author_key) DO UPDATE SET result_key = EXCLUDED.result_key, updated_at = now()`,
    [test, key, result],
  );
  return true;
}

/** 이 방에서 닉네임들의 배지 (키: identityKey) */
export async function badgesFor(roomSlug: string, nicknames: readonly string[]): Promise<BadgeMap> {
  const b = Object.hasOwn(ROOM_BADGES, roomSlug) ? ROOM_BADGES[roomSlug] : undefined;
  const keys = [...new Set(nicknames.map(identityKey).filter(Boolean))];
  if (!b || !keys.length) return {};
  const rows = await query<{ author_key: string; result_key: string }>(
    "SELECT author_key, result_key FROM test_results WHERE test_key = $1 AND author_key = ANY($2::text[])",
    [b.test, keys],
  );
  const out: BadgeMap = {};
  for (const r of rows) {
    const label = b.label(r.result_key);
    if (label) out[r.author_key] = label;
  }
  return out;
}

/** 한 사람의 배지 */
export async function badgeFor(roomSlug: string, nickname: string): Promise<string | undefined> {
  return (await badgesFor(roomSlug, [nickname]))[identityKey(nickname)];
}

/** 화면에서 실패해도 배지 없이 보이게 */
export const badgesSafe = (roomSlug: string, nicknames: readonly string[]) => badgesFor(roomSlug, nicknames).catch(() => ({}) as BadgeMap);
