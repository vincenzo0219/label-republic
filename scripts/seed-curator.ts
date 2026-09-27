/**
 * AI 큐레이터 시드 콘텐츠 게시 (콜드스타트)
 *
 *   npm run seed:curator                       # db/seed/curator/*.json 전체
 *   npm run seed:curator -- --dry-run          # 트랜잭션을 롤백하고 결과만 출력
 *   npm run seed:curator -- --allow-unreviewed # reviewedBy 가 없는 시드도 게시 (개발/스테이징용)
 *   npm run seed:curator -- path/to/file.json  # 특정 파일만
 *
 * phase=launch 는 즉시 게시, phase=drip 은 대기열에 넣어 서버 스케줄러가 물러남 정책에 따라 게시한다.
 * 같은 key 는 다시 게시되지 않으므로 여러 번 실행해도 안전하다.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../src/lib/db";
import { importSeeds, seedFileSchema, type SeedPost } from "../src/lib/curator";

async function loadSeeds(files: string[]): Promise<SeedPost[]> {
  const all: SeedPost[] = [];
  for (const file of files) {
    const parsed = seedFileSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new Error(`${file}: [${issue.path.join(".")}] ${issue.message}`);
    }
    all.push(...parsed.data);
  }
  return all;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const allowUnreviewed = args.includes("--allow-unreviewed");
  let files = args.filter((a) => !a.startsWith("--"));
  if (!files.length) {
    const dir = path.join(process.cwd(), "db", "seed", "curator");
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(dir, f));
  }
  const seeds = await loadSeeds(files);
  console.log(`${seeds.length} seeds from ${files.length} file(s): launch ${seeds.filter((s) => s.phase === "launch").length}, drip ${seeds.filter((s) => s.phase === "drip").length}`);

  const client = await pool().connect();
  try {
    const r = await importSeeds(client, seeds, { dryRun, allowUnreviewed });
    if (r.unreviewed.length && !allowUnreviewed) {
      console.error(
        `\n${r.unreviewed.length}개 시드에 reviewedBy(사람 검수자)가 없어 게시하지 않았습니다.\n` +
          `성분·건강 정보는 표시광고법/건강기능식품법 리스크가 있으니 사실관계를 검수한 뒤 reviewedBy 를 채우세요.\n` +
          `개발/스테이징에서만 --allow-unreviewed 로 강제할 수 있습니다.`,
      );
      process.exitCode = 2;
      return;
    }
    console.log(`${dryRun ? "[dry-run] " : ""}published ${r.published}, queued ${r.queued}, skipped(existing) ${r.skipped}`);
    if (r.unreviewed.length) console.warn(`warning: ${r.unreviewed.length} unreviewed seeds were included (--allow-unreviewed)`);
  } finally {
    client.release();
    await pool().end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
