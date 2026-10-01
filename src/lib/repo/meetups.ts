/**
 * 정모 제안 — 참가 투표가 임계치(min_participants)에 도달하면 사람 승인 없이 자동 확정한다.
 * (board_requests 자동 승격과 같은 방식: 행 잠금 트랜잭션 안에서 판정해 동시 참가에도 한 번만 전환)
 */
import type { PoolClient } from "pg";
import { config } from "../config";
import { query, tx } from "../db";
import { HttpError, blinded, notFound } from "../errors";
import type { Meetup } from "../types";

export type MeetupInput = { meetAt: string; location: string; minParticipants: number; capacity: number };

const MIN_LEAD_MS = 60 * 60 * 1000; // 최소 1시간 뒤
const MAX_LEAD_MS = 90 * 24 * 60 * 60 * 1000; // 최대 90일 뒤

/**
 * 비공식 방장화 방지: 같은 방의 최근 정모 제안 N건이 모두 같은 사람(닉네임 또는 fingerprint)이면 새 제안을 막는다.
 * 닉네임은 누구나 바꿀 수 있으므로 fingerprint 도 함께 본다.
 */
export async function assertCanPropose(
  client: PoolClient,
  categoryId: number,
  nickname: string,
  fingerprint: string | undefined,
  limit = config.meetupConsecutiveLimit,
): Promise<void> {
  // 같은 방의 정모 제안은 직렬화 — 동시 제안으로 상한을 우회하지 못하게
  await client.query("SELECT pg_advisory_xact_lock(4823100, $1)", [categoryId]);
  const recent = await client.query<{ nickname: string; proposer_fingerprint: string | null }>(
    `SELECT p.nickname, m.proposer_fingerprint FROM meetups m JOIN posts p ON p.id = m.post_id
      WHERE p.category_id = $1 ORDER BY p.created_at DESC, p.id DESC LIMIT $2`,
    [categoryId, limit],
  );
  if (recent.rows.length < limit) return;
  const same = recent.rows.every(
    (r) => r.nickname === nickname || (fingerprint && r.proposer_fingerprint === fingerprint),
  );
  if (same) {
    throw new HttpError(
      409,
      "meetup_consecutive_limit",
      `이 방의 최근 정모 ${limit}건을 모두 같은 분이 제안했어요. 한 사람이 모임을 계속 주도하지 않도록, 다른 분의 제안이 올라온 뒤에 다시 제안할 수 있습니다.`,
    );
  }
}

export function validateMeetup(m: MeetupInput, now = new Date()): Date {
  const at = new Date(m.meetAt);
  if (Number.isNaN(at.getTime())) throw new HttpError(400, "invalid_input", "정모 일시가 올바르지 않습니다.");
  const lead = at.getTime() - now.getTime();
  if (lead < MIN_LEAD_MS) throw new HttpError(400, "invalid_input", "정모 일시는 지금부터 1시간 이후여야 합니다.");
  if (lead > MAX_LEAD_MS) throw new HttpError(400, "invalid_input", "정모 일시는 90일 이내로 정해주세요.");
  if (m.capacity < m.minParticipants) throw new HttpError(400, "invalid_input", "정원은 확정 인원 이상이어야 합니다.");
  return at;
}

/** createPost 트랜잭션 안에서 호출. 제안자는 첫 참가자로 자동 등록된다. */
export async function insertMeetup(
  client: PoolClient,
  postId: string,
  m: MeetupInput,
  proposer: { nickname: string; fingerprint?: string },
): Promise<void> {
  const at = validateMeetup(m);
  await client.query(
    `INSERT INTO meetups (post_id, meet_at, location, min_participants, capacity, proposer_fingerprint)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [postId, at.toISOString(), m.location, m.minParticipants, m.capacity, proposer.fingerprint ?? null],
  );
  if (proposer.fingerprint) {
    await addRsvp(client, postId, proposer.fingerprint, proposer.nickname);
  }
}

async function addRsvp(client: PoolClient, postId: string, fp: string, nickname: string) {
  await client.query("INSERT INTO meetup_rsvps (post_id, fingerprint, nickname) VALUES ($1, $2, $3)", [postId, fp, nickname]);
  await client.query(
    `UPDATE meetups SET rsvp_count = rsvp_count + 1,
       status = CASE WHEN status = 'proposed' AND rsvp_count + 1 >= min_participants THEN 'confirmed' ELSE status END,
       confirmed_at = CASE WHEN status = 'proposed' AND rsvp_count + 1 >= min_participants THEN now() ELSE confirmed_at END
     WHERE post_id = $1`,
    [postId],
  );
}

export type RsvpResult = { meetup: Meetup; attending: boolean; justConfirmed: boolean };

/**
 * 참가 토글. 이미 참가 중이면 취소한다.
 * 확정된 정모는 참가 취소로 인원이 줄어도 확정 상태를 유지한다(약속 뒤집기 방지).
 */
export async function toggleRsvp(postId: string, fp: string, nickname: string, now = new Date()): Promise<RsvpResult> {
  if (!/^\d{1,18}$/.test(postId)) throw notFound("정모");
  return tx(async (client) => {
    const row = await client.query<{ status: string; meet_at: string; capacity: number; rsvp_count: number; is_blinded: boolean }>(
      `SELECT m.status, m.meet_at, m.capacity, m.rsvp_count, p.is_blinded
         FROM meetups m JOIN posts p ON p.id = m.post_id WHERE m.post_id = $1 FOR UPDATE OF m`,
      [postId],
    );
    const m = row.rows[0];
    if (!m) throw notFound("정모");
    if (m.is_blinded) throw blinded();
    if (m.status === "expired" || new Date(m.meet_at).getTime() <= now.getTime()) {
      throw new HttpError(410, "meetup_closed", "이미 지난 정모입니다.");
    }
    const existing = await client.query("SELECT 1 FROM meetup_rsvps WHERE post_id = $1 AND fingerprint = $2", [postId, fp]);
    let attending: boolean;
    let justConfirmed = false;
    if (existing.rowCount) {
      await client.query("DELETE FROM meetup_rsvps WHERE post_id = $1 AND fingerprint = $2", [postId, fp]);
      await client.query("UPDATE meetups SET rsvp_count = rsvp_count - 1 WHERE post_id = $1", [postId]);
      attending = false;
    } else {
      if (m.rsvp_count >= m.capacity) throw new HttpError(409, "meetup_full", "정원이 모두 찼습니다.");
      await addRsvp(client, postId, fp, nickname);
      attending = true;
      const after = await client.query<{ status: string }>("SELECT status FROM meetups WHERE post_id = $1", [postId]);
      justConfirmed = m.status === "proposed" && after.rows[0]!.status === "confirmed";
    }
    const meetup = (await client.query<Meetup>(`SELECT ${MEETUP_COLS} FROM meetups WHERE post_id = $1`, [postId])).rows[0]!;
    return { meetup, attending, justConfirmed };
  });
}

export const MEETUP_COLS = "meet_at, location, min_participants, capacity, rsvp_count, status, confirmed_at";

export async function listParticipants(postId: string): Promise<string[]> {
  if (!/^\d{1,18}$/.test(postId)) return [];
  const rows = await query<{ nickname: string }>("SELECT nickname FROM meetup_rsvps WHERE post_id = $1 ORDER BY created_at", [postId]);
  return rows.map((r) => r.nickname);
}

export async function isAttending(postId: string, fp: string): Promise<boolean> {
  if (!/^\d{1,18}$/.test(postId)) return false;
  return (await query("SELECT 1 FROM meetup_rsvps WHERE post_id = $1 AND fingerprint = $2", [postId, fp])).length > 0;
}

/** 확정되지 못한 채 날짜가 지난 정모를 만료 처리 (유지보수 배치) */
export async function expireMeetups(client: PoolClient, now = new Date()): Promise<number> {
  const res = await client.query("UPDATE meetups SET status = 'expired' WHERE status = 'proposed' AND meet_at < $1", [now.toISOString()]);
  return res.rowCount ?? 0;
}
