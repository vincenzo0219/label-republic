/**
 * AI 큐레이터 — 콜드스타트용 시드 콘텐츠 게시와 "자동 물러남" 정책.
 *
 * 투명성 원칙: 큐레이터 글·댓글은 is_ai_curated = true 로 저장되고 화면에 🤖 배지가 붙는다.
 * 비밀번호 해시 자리에 검증 불가능한 값을 넣어 누구도 비밀번호로 수정·삭제할 수 없다.
 * (블라인드는 일반 글과 똑같이 신고 누적으로 동작한다)
 */
import type { PoolClient } from "pg";
import { z } from "zod";
import { curatorSafetyProblems } from "./curator-ai";

export const CURATOR_NICKNAME = "AI 큐레이터";
export const CURATOR_MODEL = "ai-curator";
/** scrypt 형식이 아니므로 verifyPin 이 항상 false 를 돌려준다 */
export const CURATOR_PW_HASH = "!ai-curator";

export const seedPostSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{3,80}$/, "key는 영문 소문자·숫자·하이픈 3~80자"),
  category: z.string().min(1),
  /** launch: 오픈 전 즉시 게시 / drip: 대기열에 넣고 스케줄러가 물러남 정책에 따라 게시 */
  phase: z.enum(["launch", "drip"]),
  priority: z.number().int().default(100),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(100).max(20000),
  summary: z.tuple([z.string().min(2).max(120), z.string().min(2).max(120), z.string().min(2).max(120)]),
  comments: z.array(z.string().trim().min(2).max(1000)).max(5).default([]),
  /** Sprint 45: [잡담] 대화 시작 글 — 대화 글 안전 검사(물음표로 끝남·경험담 없음·AI 댓글 없음)를 받는다 */
  postType: z.enum(["info", "chat"]).default("info"),
  /** 사람이 사실관계를 검수했으면 검수자 이름. 없으면 "사람이 검수하지 않은 AI 글"로 게시한다 (Sprint 37부터, 안전 검사는 통과해야 함) */
  reviewedBy: z.string().trim().min(1).optional(),
});
export type SeedPost = z.infer<typeof seedPostSchema>;
export const seedFileSchema = z.array(seedPostSchema);

// ---------------------------------------------------------------------------
// 물러남 정책
// ---------------------------------------------------------------------------

export type RetreatInput = { humanPosts7d: number; aiPosts7d: number };

/**
 * 카테고리별 AI 게시 간격(시간). null 이면 게시 중단.
 * - 사람 글이 거의 없으면 하루 2건(12시간 간격)
 * - 사람 글이 늘수록 하루 1건 → 이틀에 1건
 * - 사람 글이 충분하거나 사람 비중이 80% 이상이면 완전 중단
 */
export function curatorIntervalHours({ humanPosts7d: h, aiPosts7d: ai }: RetreatInput): number | null {
  if (h >= 20) return null;
  if (h >= 10 && h / (h + ai) >= 0.8) return null;
  if (h >= 7) return 48;
  if (h >= 3) return 24;
  return 12;
}

// ---------------------------------------------------------------------------
// 게시
// ---------------------------------------------------------------------------

export type SeedContent = Pick<SeedPost, "key" | "title" | "body" | "summary" | "comments"> & { reviewed?: boolean; postType?: "info" | "chat" };

/** 시드 한 건을 게시한다. 같은 key 가 이미 게시돼 있으면 null. 트랜잭션 안에서 호출할 것. */
export async function publishSeed(client: PoolClient, categoryId: number, seed: SeedContent): Promise<string | null> {
  const ins = await client.query<{ id: string }>(
    `INSERT INTO posts (category_id, nickname, pw_hash, title, body, is_ai_curated, seed_key, moderated_by, ai_reviewed, post_type)
     VALUES ($1, $2, $3, $4, $5, true, $6, 'ai-curator', $7, $8::post_type)
     ON CONFLICT (seed_key) DO NOTHING RETURNING id`,
    [categoryId, CURATOR_NICKNAME, CURATOR_PW_HASH, seed.title, seed.body, seed.key, Boolean(seed.reviewed), seed.postType ?? "info"],
  );
  const postId = ins.rows[0]?.id;
  if (!postId) return null;
  const sum = await client.query<{ id: string }>(
    `INSERT INTO ai_summaries (post_id, summary_lines, model_version, is_author_edited) VALUES ($1, $2, $3, false) RETURNING id`,
    [postId, seed.summary, CURATOR_MODEL],
  );
  await client.query("UPDATE posts SET ai_summary_id = $1 WHERE id = $2", [sum.rows[0]!.id, postId]);
  for (const body of seed.comments) {
    await client.query(
      `INSERT INTO comments (post_id, nickname, pw_hash, body, is_ai_curated) VALUES ($1, $2, $3, $4, true)`,
      [postId, CURATOR_NICKNAME, CURATOR_PW_HASH, body],
    );
  }
  return postId;
}

export async function enqueueSeed(client: PoolClient, categoryId: number, seed: SeedPost): Promise<boolean> {
  const res = await client.query(
    `INSERT INTO curator_queue (category_id, seed_key, title, body, summary_lines, comments, priority, reviewed, post_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::post_type)
     ON CONFLICT (seed_key) DO NOTHING`,
    [categoryId, seed.key, seed.title, seed.body, seed.summary, JSON.stringify(seed.comments), seed.priority, Boolean(seed.reviewedBy), seed.postType],
  );
  return (res.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// 시드 파일 가져오기
// ---------------------------------------------------------------------------

export type ImportOptions = { requireReview?: boolean; dryRun?: boolean };
export type ImportResult = { published: number; queued: number; skipped: number; unreviewed: string[]; unsafe: { key: string; problems: string[] }[] };

/**
 * launch 시드는 즉시 게시하고, drip 시드는 대기열에 넣는다. 이미 게시·등록된 key는 건너뛴다.
 * Sprint 37부터 사람 검수(reviewedBy) 없이도 게시한다 — 대신 AI 자동 작성과 같은 안전 검사에 걸린 시드는 빼고,
 * 검수 안 된 글에는 "사람이 검수하지 않은 AI 글" 안내가 붙는다. requireReview 면 예전처럼 검수 안 된 시드가 있으면 아무것도 하지 않는다.
 */
export async function importSeeds(client: PoolClient, seeds: SeedPost[], opts: ImportOptions = {}): Promise<ImportResult> {
  const keys = new Set<string>();
  for (const s of seeds) {
    if (keys.has(s.key)) throw new Error(`duplicate seed key: ${s.key}`);
    keys.add(s.key);
  }
  const unreviewed = seeds.filter((s) => !s.reviewedBy).map((s) => s.key);
  if (unreviewed.length && opts.requireReview) {
    return { published: 0, queued: 0, skipped: seeds.length, unreviewed, unsafe: [] };
  }
  const unsafe = seeds
    .map((s) => ({ key: s.key, problems: curatorSafetyProblems({ title: s.title, body: s.body, summary: s.summary, comments: s.comments, kind: s.postType }) }))
    .filter((u) => u.problems.length);
  const unsafeKeys = new Set(unsafe.map((u) => u.key));
  seeds = seeds.filter((s) => !unsafeKeys.has(s.key));
  const cats = await client.query<{ id: number; slug: string }>("SELECT id, slug FROM categories");
  const catId = new Map(cats.rows.map((c) => [c.slug, c.id]));
  const missing = seeds.filter((s) => !catId.has(s.category)).map((s) => `${s.key} → ${s.category}`);
  if (missing.length) throw new Error(`unknown categories: ${missing.join(", ")}`);

  const result: ImportResult = { published: 0, queued: 0, skipped: unsafe.length, unreviewed, unsafe };
  await client.query("BEGIN");
  try {
    // launch 글은 우선순위가 높은(숫자가 작은) 글이 가장 최신이 되도록 역순으로 게시한다
    const ordered = [...seeds].sort((a, b) => b.priority - a.priority);
    for (const seed of ordered) {
      const id = catId.get(seed.category)!;
      if (seed.phase === "launch") {
        (await publishSeed(client, id, { ...seed, reviewed: Boolean(seed.reviewedBy) })) ? result.published++ : result.skipped++;
      } else {
        (await enqueueSeed(client, id, seed)) ? result.queued++ : result.skipped++;
      }
    }
    await client.query(opts.dryRun ? "ROLLBACK" : "COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return result;
}
