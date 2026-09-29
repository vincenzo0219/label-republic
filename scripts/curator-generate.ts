/**
 * Claude로 AI 큐레이터 시드 초안을 만든다. 결과는 검수 전 초안(reviewedBy 없음)으로 저장되며,
 * 사람이 사실관계를 확인하고 reviewedBy 를 채운 뒤 db/seed/curator/ 로 옮겨 seed:curator 로 게시한다.
 *
 *   npm run curator:generate -- --category supplements --phase drip "아연 형태별 원소 함량" "칼슘 탄산염 vs 구연산염"
 *
 * 출력: db/seed/drafts/<category>-<timestamp>.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../src/lib/config";
import { seedPostSchema, type SeedPost } from "../src/lib/curator";
import { CURATOR_SYSTEM_PROMPT, CuratorDraftSchema } from "../src/lib/curator-ai";
import { pool, query } from "../src/lib/db";

// 안내문·출력 형식은 자동 작성(src/lib/curator-ai.ts)과 같은 것을 쓴다
const DraftSchema = CuratorDraftSchema;
const SYSTEM_PROMPT = CURATOR_SYSTEM_PROMPT;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!config.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const category = arg("category");
  const phase = (arg("phase") ?? "drip") as "launch" | "drip";
  const topics = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
  if (!category || !topics.length) throw new Error('usage: --category <slug> [--phase drip|launch] "주제1" "주제2" ...');

  const cats = await query<{ name: string }>("SELECT name FROM categories WHERE slug = $1", [category]);
  await pool().end();
  if (!cats[0]) throw new Error(`unknown category: ${category}`);

  const client = new Anthropic();
  const stamp = Date.now().toString(36);
  const drafts: SeedPost[] = [];

  for (const [i, topic] of topics.entries()) {
    console.log(`generating: ${topic}`);
    const response = await client.messages.parse({
      model: config.summaryModel,
      max_tokens: 16000,
      output_config: { effort: "high", format: zodOutputFormat(DraftSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `보드: ${cats[0].name}\n주제: ${topic}` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.warn(`  skipped (${response.stop_reason})`);
      continue;
    }
    const d = response.parsed_output;
    const seed = seedPostSchema.safeParse({
      key: `${category}-gen-${stamp}-${i}`,
      category,
      phase,
      title: d.title,
      body: d.body,
      summary: [d.summary_line1, d.summary_line2, d.summary_line3],
      comments: d.faq_comments.slice(0, 3),
    });
    if (!seed.success) {
      console.warn(`  invalid draft: ${seed.error.issues[0]?.message}`);
      continue;
    }
    drafts.push(seed.data);
  }

  const dir = path.join(process.cwd(), "db", "seed", "drafts");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${category}-${stamp}.json`);
  await writeFile(file, JSON.stringify(drafts, null, 2) + "\n");
  console.log(`\n${drafts.length} draft(s) → ${path.relative(process.cwd(), file)}`);
  console.log("사실관계를 검수하고 각 항목에 reviewedBy 를 채운 뒤 db/seed/curator/ 로 옮겨 npm run seed:curator 로 게시하세요.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
