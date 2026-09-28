/**
 * 게시글 이미지 (Sprint 12).
 *
 *   업로드(POST /api/uploads) → { id, token } → 글 작성·수정 시 images: [{ id, token, alt }] 로 첨부
 *
 * - token 은 id 의 HMAC 이라 업로드한 브라우저만 그 이미지를 자기 글에 붙일 수 있다
 *   (fingerprint 는 모바일 IP 변경으로 바뀔 수 있어 쓰지 않는다).
 * - 다른 글에 이미 붙은 이미지는 가져올 수 없다. 수정 시 같은 글의 기존 이미지는 토큰 없이 유지할 수 있다.
 * - 첨부되지 않은 업로드는 24시간 뒤 유지보수 배치가 지운다.
 * - 파일은 /media/* 로만 제공하며, 글이 블라인드·삭제되면 더 이상 내려주지 않는다.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { config } from "../config";
import { query } from "../db";
import { HttpError } from "../errors";
import { processImage } from "../images/process";
import { fullKey, imageStorage, thumbKey } from "../images/storage";
import type { PostImage } from "../types";

export type { PostImage };

export const MAX_IMAGES_PER_POST = 6;
export const ORPHAN_TTL_HOURS = 24;

export type ImageRef = { id: string; token?: string; alt?: string };

export { imageUrl, thumbUrl } from "../media-url";

export function imageToken(id: string): string {
  return createHmac("sha256", config.appSecret).update(`post-image:${id}`).digest("base64url").slice(0, 32);
}

function tokenOk(id: string, token: string | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(imageToken(id));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type UploadResult = { id: string; token: string; width: number; height: number };

/** 변환·저장 후 첨부 전 상태로 기록한다 */
export async function saveUpload(input: Buffer, fingerprint: string | null): Promise<UploadResult> {
  const img = await processImage(input);
  const id = randomUUID();
  const storage = imageStorage();
  await Promise.all([storage.put(fullKey(id), img.full, "image/webp"), storage.put(thumbKey(id), img.thumb, "image/webp")]);
  try {
    await query(
      `INSERT INTO post_images (id, width, height, bytes, thumb_width, thumb_height, sha256, uploader_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, img.width, img.height, img.full.length, img.thumbWidth, img.thumbHeight, img.sha256, fingerprint],
    );
  } catch (err) {
    await deleteFiles([id]);
    throw err;
  }
  return { id, token: imageToken(id), width: img.width, height: img.height };
}

/**
 * 글에 이미지 목록을 붙인다 (트랜잭션 안에서, 글 행을 잠근 뒤 호출).
 * 목록이 곧 최종 상태: 순서대로 position 을 매기고, 이 글에 붙어 있었지만 목록에 없는 이미지는 떼어낸다.
 * 떼어낸 이미지 id 를 돌려주며, 호출자는 커밋 후 deleteFiles 로 파일을 지운다.
 */
export async function setPostImages(client: PoolClient, postId: string, refs: ImageRef[]): Promise<string[]> {
  if (refs.length > MAX_IMAGES_PER_POST) throw new HttpError(400, "too_many_images", `이미지는 글당 ${MAX_IMAGES_PER_POST}장까지 첨부할 수 있습니다.`);
  const ids = refs.map((r) => r.id);
  if (new Set(ids).size !== ids.length || !ids.every((id) => UUID.test(id))) {
    throw new HttpError(400, "invalid_image", "이미지 정보가 올바르지 않습니다.");
  }
  const { rows } = await client.query<{ id: string; post_id: string | null }>(
    "SELECT id, post_id FROM post_images WHERE id = ANY($1::uuid[]) FOR UPDATE",
    [ids],
  );
  const found = new Map(rows.map((r) => [r.id, r.post_id]));
  for (const ref of refs) {
    const owner = found.get(ref.id);
    if (owner === undefined) throw new HttpError(400, "image_expired", "업로드한 이미지를 찾을 수 없습니다. 다시 올려주세요.");
    // 이 글에 이미 붙은 이미지는 그대로 유지 가능, 새 이미지는 업로드 토큰이 있어야 한다
    const allowed = owner === postId || (owner === null && tokenOk(ref.id, ref.token));
    if (!allowed) throw new HttpError(403, "image_forbidden", "첨부할 수 없는 이미지입니다.");
  }
  const { rows: removed } = await client.query<{ id: string }>(
    "DELETE FROM post_images WHERE post_id = $1 AND NOT (id = ANY($2::uuid[])) RETURNING id",
    [postId, ids],
  );
  for (const [i, ref] of refs.entries()) {
    await client.query(
      `UPDATE post_images SET post_id = $2, position = $3, alt = $4, attached_at = coalesce(attached_at, now()) WHERE id = $1`,
      [ref.id, postId, i, (ref.alt ?? "").trim().slice(0, 200)],
    );
  }
  return removed.map((r) => r.id);
}

export async function listPostImages(postId: string): Promise<PostImage[]> {
  if (!/^\d{1,18}$/.test(postId)) return [];
  return query<PostImage>(
    "SELECT id, alt, width, height, thumb_width, thumb_height FROM post_images WHERE post_id = $1 ORDER BY position",
    [postId],
  );
}

/** /media 라우트용: 글에 붙어 있고 그 글이 보이는 상태일 때만 파일을 내준다 */
export async function readServableImage(id: string, variant: "full" | "thumb"): Promise<Buffer | null> {
  if (!UUID.test(id)) return null;
  const rows = await query<{ ok: boolean }>(
    `SELECT true AS ok FROM post_images i JOIN posts p ON p.id = i.post_id WHERE i.id = $1 AND NOT p.is_blinded`,
    [id],
  );
  if (!rows[0]) return null;
  return imageStorage().get(variant === "full" ? fullKey(id) : thumbKey(id));
}

/** 파일 삭제 (실패해도 계속 — 행이 없으면 /media 가 내주지 않으므로 남은 파일은 저장 공간만 차지한다) */
export async function deleteFiles(ids: string[]): Promise<void> {
  const storage = imageStorage();
  await Promise.all(
    ids.flatMap((id) => [fullKey(id), thumbKey(id)]).map((key) =>
      storage.delete(key).catch((err) => console.error("[images] 파일 삭제 실패:", key, (err as Error).message)),
    ),
  );
}

/** 첨부되지 않은 채 오래된 업로드 정리 (유지보수 배치) */
export async function sweepOrphanImages(now = new Date(), limit = 500): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM post_images WHERE id IN (
       SELECT id FROM post_images WHERE post_id IS NULL AND created_at < $1::timestamptz - make_interval(hours => $2)
        ORDER BY created_at LIMIT $3)
     RETURNING id`,
    [now.toISOString(), ORPHAN_TTL_HOURS, limit],
  );
  await deleteFiles(rows.map((r) => r.id));
  return rows.length;
}
