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
import { z } from "zod";
import { config } from "../src/lib/config";
import { seedPostSchema, type SeedPost } from "../src/lib/curator";
import { pool, query } from "../src/lib/db";

const DraftSchema = z.object({
  title: z.string(),
  body: z.string(),
  summary_line1: z.string(),
  summary_line2: z.string(),
  summary_line3: z.string(),
  faq_comments: z.array(z.string()),
});

const SYSTEM_PROMPT = `당신은 덕후 팩트체크 커뮤니티 "노방장"의 AI 큐레이터입니다.
초기 커뮤니티를 위한 정보 글을 씁니다. 이 글은 🤖 AI 큐레이터 배지와 함께 AI 작성임이 명시되어 게시됩니다.

원칙:
- 라벨·스펙을 "읽는 법"과 널리 확립된 사실 위주로 씁니다. 불확실하거나 논쟁 중인 내용은 그렇다고 밝힙니다.
- 특정 브랜드·제품을 추천하거나 비방하지 않습니다.
- 질병의 예방·치료·완치, 효능 보장 같은 단정적 의학·효능 표현을 쓰지 않습니다(표시광고법·건강기능식품법).
- 수치는 일반적으로 알려진 범위로 쓰고, 제품마다 다르니 라벨을 확인하라고 안내합니다.
- 사람인 척하거나 개인 경험담을 지어내지 않습니다.
- 본문은 한국어 700~1200자, 소제목 없이 짧은 문단 여러 개. 마지막 문단에 "확인 체크리스트"를 한 줄씩.
- summary_line1~3은 각각 60자 안팎의 핵심 사실 한 문장.
- faq_comments는 독자가 물을 법한 질문과 답을 "Q. ... / A. ..." 형식으로 2개. 사람 댓글처럼 꾸미지 않습니다.`;

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
