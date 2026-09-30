/**
 * AI 큐레이터 시드 콘텐츠 게시 (콜드스타트)
 *
 *   npm run seed:curator                       # db/seed/curator/*.json 전체
 *   npm run seed:curator -- --dry-run          # 트랜잭션을 롤백하고 결과만 출력
 *   npm run seed:curator -- --require-review   # reviewedBy(사람 검수자)가 없는 시드가 있으면 게시하지 않음 (Sprint 36까지의 기본)
 *
 * Sprint 37부터 사람 검수 없이 게시한다: AI 자동 작성과 같은 안전 검사(src/lib/curator-ai.ts)에 걸린 시드만 빼고,
 * 검수 안 된 글에는 "사람이 검수하지 않은 AI 글" 안내가 붙는다.
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
  const requireReview = args.includes("--require-review");
  let files = args.filter((a) => !a.startsWith("--"));
  if (!files.length) {
    const dir = path.join(process.cwd(), "db", "seed", "curator");
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(dir, f));
  }
  const seeds = await loadSeeds(files);
  console.log(`${seeds.length} seeds from ${files.length} file(s): launch ${seeds.filter((s) => s.phase === "launch").length}, drip ${seeds.filter((s) => s.phase === "drip").length}`);

  const client = await pool().connect();
  try {
    const r = await importSeeds(client, seeds, { dryRun, requireReview });
    if (r.unreviewed.length && requireReview) {
      console.error(`\n${r.unreviewed.length}개 시드에 reviewedBy(사람 검수자)가 없어 게시하지 않았습니다 (--require-review).`);
      process.exitCode = 2;
      return;
    }
    for (const u of r.unsafe) console.warn(`안전 검사에 걸려 뺌: ${u.key} — ${u.problems.join(", ")}`);
    console.log(`${dryRun ? "[dry-run] " : ""}published ${r.published}, queued ${r.queued}, skipped ${r.skipped} (unsafe ${r.unsafe.length})`);
    if (r.unreviewed.length) console.log(`사람 검수 없이 게시·등록: ${r.unreviewed.length}건 ("사람이 검수하지 않은 AI 글" 안내가 붙음)`);
  } finally {
    client.release();
    await pool().end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
