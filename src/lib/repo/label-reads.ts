/**
 * 라벨 읽기 기록 (Sprint 20). 같은 사진은 한 번만 읽고, 글을 저장할 때 수치 출처(AI 그대로/고침)를 판단한다.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { PoolClient } from "pg";
import { config } from "../config";
import { query } from "../db";
import { HttpError } from "../errors";
import { reportError } from "../error-tracking";
import { fullKey, imageStorage } from "../images/storage";
import { LabelReadUnavailable, readLabelImage, sameAsRead, sameDatesAsRead, type LabelReadResult } from "../label-read";
import type { LabelDate } from "../label-dates";
import { tokenOk } from "./images";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type LabelRead = LabelReadResult & { model: string; cached: boolean };

/**
 * 업로드한 사람(토큰)만, 아직 글에 붙기 전의 사진만 읽는다. 같은 사진·같은 보드면 저장된 결과를 돌려준다.
 */
export async function readLabel(imageId: string, token: string, categorySlug: string, fp: string): Promise<LabelRead> {
  if (!UUID.test(imageId) || !tokenOk(imageId, token)) throw new HttpError(403, "image_forbidden", "읽을 수 없는 사진입니다.");
  const cat = await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [categorySlug]);
  if (!cat[0]) throw new HttpError(400, "invalid_category", "카테고리를 먼저 선택해주세요.");
  const img = await query<{ post_id: string | null }>("SELECT post_id FROM post_images WHERE id = $1", [imageId]);
  if (!img[0]) throw new HttpError(404, "image_expired", "업로드한 사진을 찾을 수 없습니다. 다시 올려주세요.");
  if (img[0].post_id) throw new HttpError(409, "image_attached", "이미 글에 붙은 사진은 새로 올려서 읽어주세요.");

  const cached = await query<{ result: LabelReadResult; model: string; category_id: number }>(
    "SELECT result, model, category_id FROM label_reads WHERE image_id = $1",
    [imageId],
  );
  if (cached[0] && cached[0].category_id === cat[0].id) return { ...cached[0].result, model: cached[0].model, cached: true };

  // 하루 전체 한도 (비용 상한) — Claude 를 부르기 전에 한 번씩 원자적으로 예약한다 (Sprint 29 보안 재점검).
  // 예전에는 label_reads 행 수를 셌는데, 같은 사진을 보드만 바꿔 다시 읽으면 행이 덮어써져 한도에 잡히지 않았고,
  // 확인과 저장 사이(최대 90초)에 동시 요청이 모두 통과했다.
  if (!(await reserveLabelRead())) {
    throw new HttpError(503, "label_read_quota", "오늘은 라벨 읽기가 많아 잠시 쉬고 있어요. 수치를 직접 입력해주세요.");
  }
  const webp = await imageStorage().get(fullKey(imageId));
  if (!webp) throw new HttpError(404, "image_expired", "업로드한 사진을 찾을 수 없습니다. 다시 올려주세요.");

  let read: { result: LabelReadResult; model: string };
  try {
    read = await readLabelImage(webp, categorySlug);
  } catch (err) {
    if (err instanceof LabelReadUnavailable) {
      throw new HttpError(422, "label_unreadable", "이 사진은 자동으로 읽지 못했어요. 수치를 직접 입력해주세요.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new HttpError(503, "label_read_busy", "라벨 읽기가 잠시 바빠요. 조금 뒤 다시 시도하거나 직접 입력해주세요.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[label-read] Claude API error ${err.status}: ${err.message}`);
      reportError(err, { kind: "api", path: "POST /api/label-read (claude)" });
      throw new HttpError(503, "label_read_failed", "라벨을 읽지 못했어요. 잠시 뒤 다시 시도하거나 직접 입력해주세요.");
    }
    throw err;
  }
  await query(
    `INSERT INTO label_reads (image_id, category_id, model, result, fingerprint) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (image_id) DO UPDATE SET category_id = EXCLUDED.category_id, model = EXCLUDED.model, result = EXCLUDED.result, created_at = now()`,
    [imageId, cat[0].id, read.model, JSON.stringify(read.result), fp],
  );
  return { ...read.result, model: read.model, cached: false };
}

/** 하루(KST) 라벨 읽기 호출 수를 한도 안에서만 1 늘린다 — 동시 요청에도 한도를 넘지 않는다 */
export async function reserveLabelRead(max = config.labelReadDailyMax, now = new Date()): Promise<boolean> {
  const day = Math.floor((now.getTime() + 9 * 3600_000) / 86_400_000); // KST 날짜
  const rows = await query<{ count: number }>(
    `INSERT INTO rate_limits (key, bucket, count, expires_at) VALUES ('label-read:day', $1, 1, $2)
     ON CONFLICT (key, bucket) DO UPDATE SET count = rate_limits.count + 1 WHERE rate_limits.count < $3
     RETURNING count`,
    [day, new Date((day + 2) * 86_400_000).toISOString(), max],
  );
  return rows.length > 0 && max > 0;
}

export type FactEvidence = { image?: string; fromLabel?: boolean };

/**
 * 글에 저장할 수치의 근거 사진·출처를 정한다 (트랜잭션 안, 사진을 붙인 뒤 호출).
 * - 근거 사진은 이 글에 붙은 사진만
 * - 라벨 읽기로 넣은 수치(fromLabel)는 그 사진을 읽은 결과와 항목·값·단위·기준이 같으면 ai, 다르면 ai_edited
 */
export async function resolveEvidence(
  client: PoolClient,
  postId: string,
  facts: (FactEvidence & { attribute: string; value: number; unit: string; basis?: string })[],
): Promise<{ image: string | null; origin: "manual" | "ai" | "ai_edited" }[]> {
  const ids = [...new Set(facts.map((f) => f.image).filter((x): x is string => !!x))];
  if (!ids.length) return facts.map(() => ({ image: null, origin: "manual" as const }));
  if (!ids.every((id) => UUID.test(id))) throw new HttpError(400, "invalid_image", "근거 사진 정보가 올바르지 않습니다.");
  const { rows } = await client.query<{ id: string; result: LabelReadResult | null }>(
    `SELECT i.id, r.result FROM post_images i LEFT JOIN label_reads r ON r.image_id = i.id WHERE i.post_id = $1 AND i.id = ANY($2::uuid[])`,
    [postId, ids],
  );
  const reads = new Map(rows.map((r) => [r.id, r.result]));
  return facts.map((f, i) => {
    if (!f.image) return { image: null, origin: "manual" as const };
    if (!reads.has(f.image)) throw new HttpError(400, "invalid_image", `${i + 1}번째 수치의 근거 사진은 이 글에 첨부한 사진이어야 합니다.`);
    const read = reads.get(f.image);
    if (!f.fromLabel || !read) return { image: f.image, origin: "manual" as const };
    return { image: f.image, origin: sameAsRead(read, f) ? ("ai" as const) : ("ai_edited" as const) };
  });
}

/**
 * 제품 라벨 날짜의 근거 사진·출처 (Sprint 26, 트랜잭션 안, 사진을 붙인 뒤 호출). 수치(resolveEvidence)와 같은 규칙:
 * 근거 사진은 이 글에 붙은 사진만, 라벨 읽기로 넣은 날짜가 읽은 결과와 같으면 ai, 다르면 ai_edited.
 */
export async function resolveDateEvidence(
  client: PoolClient,
  postId: string,
  d: { image?: string; fromLabel?: boolean; made: LabelDate | null; expires: LabelDate | null },
  index: number,
): Promise<{ image: string | null; origin: "manual" | "ai" | "ai_edited" }> {
  if (!d.image) return { image: null, origin: "manual" };
  if (!UUID.test(d.image)) throw new HttpError(400, "invalid_image", "날짜 근거 사진 정보가 올바르지 않습니다.");
  const { rows } = await client.query<{ result: LabelReadResult | null }>(
    "SELECT r.result FROM post_images i LEFT JOIN label_reads r ON r.image_id = i.id WHERE i.post_id = $1 AND i.id = $2",
    [postId, d.image],
  );
  if (!rows[0]) throw new HttpError(400, "invalid_image", `${index + 1}번째 제품의 날짜 근거 사진은 이 글에 첨부한 사진이어야 합니다.`);
  const read = rows[0].result;
  if (!d.fromLabel || !read) return { image: d.image, origin: "manual" };
  return { image: d.image, origin: sameDatesAsRead(read, d.made, d.expires) ? "ai" : "ai_edited" };
}
