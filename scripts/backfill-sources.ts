/**
 * 기존 글 본문의 링크를 출처로 옮긴다 (출처가 하나도 없는 글만, 글당 최대 8개).
 *
 *   npm run sources:backfill -- --dry-run     # 무엇이 추가될지 보기만
 *   npm run sources:backfill                  # 실제 추가 (확인 배치가 이후 링크 상태를 확인)
 */
import { pool, query, tx } from "../src/lib/db";
import { setPostSources } from "../src/lib/repo/sources";
import { extractUrls } from "../src/lib/sources";

async function main() {
  const dry = process.argv.includes("--dry-run");
  const rows = await query<{ id: string; body: string }>(
    `SELECT p.id, p.body FROM posts p
      WHERE p.body ~* 'https?://' AND NOT EXISTS (SELECT 1 FROM post_sources s WHERE s.post_id = p.id)
      ORDER BY p.id`,
  );
  let posts = 0;
  let links = 0;
  for (const r of rows) {
    const urls = extractUrls(r.body);
    if (!urls.length) continue;
    posts++;
    links += urls.length;
    if (dry) {
      console.log(`#${r.id}: ${urls.join(" ")}`);
      continue;
    }
    await tx((client) => setPostSources(client, r.id, urls.map((url) => ({ url }))));
  }
  console.log(`${dry ? "[dry-run] " : ""}글 ${posts}개에 출처 ${links}개${dry ? " 추가 예정" : " 추가"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
