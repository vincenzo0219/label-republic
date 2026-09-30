/**
 * 글 출처 (Sprint 13). 목록이 곧 최종 상태: 작성·수정 시 받은 순서대로 저장하고, 빠진 출처는 지운다.
 * 이미 있던 주소는 확인 결과(상태·페이지 제목)를 유지한다.
 */
import type { PoolClient } from "pg";
import { query } from "../db";
import { HttpError } from "../errors";
import { MAX_SOURCES, normalizeSourceUrl, type SourceKind } from "../sources";
import type { PostSource } from "../types";

export type SourceRef = { url: string; label?: string };
export type { PostSource };

export async function setPostSources(client: PoolClient, postId: string, refs: SourceRef[]): Promise<void> {
  if (refs.length > MAX_SOURCES) throw new HttpError(400, "too_many_sources", `출처는 ${MAX_SOURCES}개까지 달 수 있습니다.`);
  const items: { url: string; host: string; kind: SourceKind; label: string }[] = [];
  for (const ref of refs) {
    let n;
    try {
      n = normalizeSourceUrl(ref.url);
    } catch (err) {
      throw new HttpError(400, "invalid_source", (err as Error).message);
    }
    if (items.some((i) => i.url === n.url)) continue; // 같은 주소는 한 번만
    items.push({ ...n, label: (ref.label ?? "").trim().slice(0, 200) });
  }
  await client.query("DELETE FROM post_sources WHERE post_id = $1 AND NOT (url = ANY($2::text[]))", [postId, items.map((i) => i.url)]);
  for (const [position, i] of items.entries()) {
    await client.query(
      `INSERT INTO post_sources (post_id, position, url, host, kind, label) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (post_id, url) DO UPDATE SET position = EXCLUDED.position, label = EXCLUDED.label`,
      [postId, position, i.url, i.host, i.kind, i.label],
    );
  }
  await client.query("UPDATE posts SET source_count = $2 WHERE id = $1", [postId, items.length]);
}

export async function listPostSources(postId: string): Promise<PostSource[]> {
  if (!/^\d{1,18}$/.test(postId)) return [];
  return query<PostSource>(
    `SELECT id, url, host, kind, label, page_title, status, checked_at FROM post_sources WHERE post_id = $1 ORDER BY position`,
    [postId],
  );
}
