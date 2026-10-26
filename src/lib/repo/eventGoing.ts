/**
 * 🙋 같이 갈 사람 (10/26) 저장소. [행사] 글에만.
 * - event_going: 갈 거예요 (브라우저당 하나, fingerprint)
 * - event_groups/members/messages: "같이 가요" 모집(open) · 자동 조(auto), 조원만 보는 채팅
 * - event_pool: 🙌 혼자 가요, 조 짜 주세요 → D-3 12시 배치가 조를 만든다
 * - event_penalties: 노쇼·늦은 취소 (본인에게만 보인다)
 * 운영자가 대신 글·댓글을 쓰는 일은 없다. 조 채팅도 사람 말만.
 */
import type { PoolClient } from "pg";
import { query, tx, isUniqueViolation } from "../db";
import { HttpError, blinded, notFound } from "../errors";
import { hashPin, verifyPin } from "../password";
import { assertPin } from "./pin-guard";
import { eventMemberRef, eventPoolRef } from "../comment-token";
import { eventSpan, eventName, dayIso, isoDayNumber } from "../adSchedule";
import {
  AUTO_MAX, GROUPS_SHOW_MIN, OPEN_CAP_MAX, OPEN_CAP_MIN, REPORT_HIDE, SLOT_LABEL,
  buildAutoGroups, chatOpen, chatOpensAt, penaltyText, checkinWindow, freeCancelUntil, goingDisplay, groupClosed, inCheckin, keepBadge,
  kstToday, meetTime, parseOpening, penaltyUntil, placeLine, poolDue, poolOpen, quietHours, reminderDue, settleOutcomes, spreadPlace,
  type Age, type Outcome, type Slot,
} from "../eventGoing";
import { cleanChat } from "../eventChat";
import { GEO_RADIUS_M, distanceM, matchVenue } from "../venues";
import { sendPush, type PushMessage, type SendResult } from "../push";
import { assertGroupInteractive, matchingError } from "./infoOnly";

const ID = /^\d{1,18}$/;

export type EventPost = { id: string; title: string; body: string; created_at: string; is_blinded: boolean; slug: string; room: string };

export async function loadEventPost(postId: string, c?: PoolClient): Promise<EventPost> {
  if (!ID.test(postId)) throw notFound();
  const sql = `SELECT p.id::text, p.title, p.body, p.created_at, p.is_blinded, c.slug, c.name AS room, c.info_only, c.no_matching
                 FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`;
  type Row = EventPost & { info_only: boolean; no_matching: boolean };
  const found = c ? (await c.query<Row>(sql, [postId])).rows[0] : (await query<Row>(sql, [postId]))[0];
  if (!found) throw notFound();
  // 정보만 보여 주는 방(092)·만남 연결 기능 없는 방(098, 💌 미혼남녀 만남 행사): 갈 거예요·같이 가요·조 짜기 모두 거절
  const blocked = matchingError(found);
  if (blocked) throw blocked;
  const { info_only: _io, no_matching: _nm, ...row } = found;
  if (row.is_blinded) throw blinded();
  if (!row.title.startsWith("[행사]")) throw new HttpError(400, "not_event", "행사 글에서만 쓸 수 있어요.");
  return row;
}

/** 행사 날짜 목록 ("YYYY-MM-DD", 오늘 이후, 최대 14일). 날짜를 모르면 null */
export function eventDays(p: Pick<EventPost, "title" | "body" | "created_at">, now = new Date()): string[] | null {
  const span = eventSpan({ id: "", ...p });
  if (!span) return null;
  const today = isoDayNumber(kstToday(now));
  const out: string[] = [];
  for (let d = Math.max(span.start, today); d <= span.end && out.length < 14; d++) out.push(dayIso(d));
  return out;
}

// ---------------------------------------------------------------------------
// 갈 거예요
// ---------------------------------------------------------------------------

export type GoingSummary = { count: number; going: boolean; display: ReturnType<typeof goingDisplay> };

export async function goingSummary(postId: string, fp: string | null): Promise<GoingSummary> {
  if (!ID.test(postId)) return { count: 0, going: false, display: null };
  const [row] = await query<{ count: number; names: string[] | null; mine: boolean }>(
    `SELECT count(*)::int AS count,
            (array_agg(nickname ORDER BY created_at) FILTER (WHERE nickname IS NOT NULL)) AS names,
            bool_or(fingerprint = $2) AS mine
       FROM event_going WHERE post_id = $1`,
    [postId, fp ?? ""],
  );
  const count = row?.count ?? 0;
  return { count, going: !!row?.mine, display: goingDisplay(count, row?.names ?? []) };
}

/** 갈 거예요 토글. 켤 때만 닉네임 공개·푸시 구독을 받는다 */
export async function toggleGoing(postId: string, fp: string, opts: { nickname?: string | null; subscriptionId?: string | null } = {}): Promise<GoingSummary> {
  await loadEventPost(postId);
  const del = await query("DELETE FROM event_going WHERE post_id = $1 AND fingerprint = $2 RETURNING 1", [postId, fp]);
  if (!del.length) {
    await query(
      `INSERT INTO event_going (post_id, fingerprint, nickname, subscription_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (post_id, fingerprint) DO NOTHING`,
      [postId, fp, opts.nickname?.trim() || null, opts.subscriptionId ?? null],
    );
  }
  return goingSummary(postId, fp);
}

/** 목록 카드용: 글마다 갈 거예요 수, 열린 모집 수 */
export async function eventCardCounts(ids: string[], now = new Date()): Promise<Map<string, { going: number; open: number }>> {
  const list = ids.filter((x) => ID.test(x));
  if (!list.length) return new Map();
  const rows = await query<{ id: string; going: number; open: number }>(
    `SELECT x.id::text,
            (SELECT count(*)::int FROM event_going g WHERE g.post_id = x.id) AS going,
            (SELECT count(*)::int FROM event_groups e WHERE e.post_id = x.id AND e.kind = 'open' AND NOT e.is_hidden
                AND e.member_count < e.capacity AND e.day >= $2::date) AS open
       FROM unnest($1::bigint[]) AS x(id)`,
    [list, kstToday(now)],
  );
  return new Map(rows.map((r) => [r.id, { going: r.going, open: r.open }]));
}

// ---------------------------------------------------------------------------
// 노쇼 제한
// ---------------------------------------------------------------------------

type Strike = { id: string; created_at: string; nickname: string; pin_hash: string; fingerprint: string };

/** 이 기기(fingerprint) 또는 같은 닉네임+PIN 의 취소되지 않은 기록으로 제한 기한을 센다 */
export async function activePenalty(fp: string, who?: { nickname: string; pin: string }, now = new Date()): Promise<Date | null> {
  const rows = await query<Strike>(
    `SELECT id::text, created_at, nickname, pin_hash, fingerprint FROM event_penalties
      WHERE cleared_at IS NULL AND created_at > $3::timestamptz - interval '90 days' AND (fingerprint = $1 OR nickname = $2)
      ORDER BY created_at DESC LIMIT 20`,
    [fp, who?.nickname ?? "", now.toISOString()],
  );
  const mine: string[] = [];
  for (const r of rows) {
    if (r.fingerprint === fp || (who && (await verifyPin(who.pin, r.pin_hash)))) mine.push(r.created_at);
  }
  return penaltyUntil(mine, now);
}

async function assertNoPenalty(fp: string, who: { nickname: string; pin: string }, now: Date) {
  const until = await activePenalty(fp, who, now);
  if (until) {
    throw new HttpError(403, "event_penalty", penaltyText(until));
  }
}

/** 지난 "다녀옴" 횟수 (같은 기기, 또는 같은 닉네임+PIN) */
async function keepCount(fp: string, who: { nickname: string; pin: string }): Promise<number> {
  const rows = await query<{ fingerprint: string; pin_hash: string }>(
    "SELECT fingerprint, pin_hash FROM event_group_members WHERE outcome = 'attended' AND (fingerprint = $1 OR nickname = $2) ORDER BY id DESC LIMIT 30",
    [fp, who.nickname],
  );
  let n = 0;
  for (const r of rows) if (r.fingerprint === fp || (await verifyPin(who.pin, r.pin_hash))) n++;
  return n;
}

/** 이의제기: 이 기기의 가장 최근 기록에 한 줄 */
export async function appealPenalty(fp: string, text: string): Promise<boolean> {
  const rows = await query(
    `UPDATE event_penalties SET appeal = $2, appeal_at = now()
      WHERE id = (SELECT id FROM event_penalties WHERE fingerprint = $1 AND cleared_at IS NULL ORDER BY created_at DESC LIMIT 1)
      RETURNING 1`,
    [fp, text.slice(0, 200)],
  );
  return rows.length > 0;
}

export type PenaltyAppeal = { id: string; nickname: string; kind: string; appeal: string; appeal_at: string; created_at: string; post_id: string | null; title: string | null };

export async function listPenaltyAppeals(): Promise<PenaltyAppeal[]> {
  return query<PenaltyAppeal>(
    `SELECT e.id::text, e.nickname, e.kind, e.appeal, e.appeal_at, e.created_at, g.post_id::text, p.title
       FROM event_penalties e LEFT JOIN event_groups g ON g.id = e.group_id LEFT JOIN posts p ON p.id = g.post_id
      WHERE e.appeal_at IS NOT NULL AND e.cleared_at IS NULL ORDER BY e.appeal_at LIMIT 100`,
  );
}

export async function clearPenalty(id: string): Promise<boolean> {
  if (!ID.test(id)) return false;
  return (await query("UPDATE event_penalties SET cleared_at = now() WHERE id = $1 AND cleared_at IS NULL RETURNING 1", [id])).length > 0;
}

// ---------------------------------------------------------------------------
// 같이 가요 모집 (open)
// ---------------------------------------------------------------------------

export type GroupRow = {
  id: string; post_id: string; kind: "open" | "auto"; day: string; meet_time: string; place: string; station: string | null; intro: string;
  capacity: number; member_count: number; slot: Slot | null; age: Age | null; seq: number | null; venue_lat: number | null; venue_lng: number | null;
  is_hidden: boolean; settled_at: string | null;
};
const GROUP_COLS = `id::text, post_id::text, kind, to_char(day, 'YYYY-MM-DD') AS day, meet_time, place, station, intro, capacity, member_count,
  slot, age, seq, venue_lat, venue_lng, is_hidden, settled_at`;

export type OpenGroupInput = { day: string; meetTime: string; place: string; capacity: number; intro: string; nickname: string; pin: string };

export async function createOpenGroup(postId: string, fp: string, input: OpenGroupInput, now = new Date()): Promise<{ id: string; token: string }> {
  const post = await loadEventPost(postId);
  const days = eventDays(post, now);
  const today = kstToday(now);
  if (input.day < today) throw new HttpError(400, "invalid_input", "지난 날짜로는 모집할 수 없어요.");
  if (days && !days.includes(input.day)) throw new HttpError(400, "invalid_input", "행사 날짜 안에서 골라 주세요.");
  if (!days && isoDayNumber(input.day) - isoDayNumber(today) > 60) throw new HttpError(400, "invalid_input", "60일 안의 날짜로 골라 주세요.");
  if (input.capacity < OPEN_CAP_MIN || input.capacity > OPEN_CAP_MAX) throw new HttpError(400, "invalid_input", "정원은 2~6명이에요.");
  const who = { nickname: input.nickname, pin: input.pin };
  await assertNoPenalty(fp, who, now);
  for (const t of [input.place, input.intro]) {
    const c = cleanChat(t);
    if (c.reject) throw new HttpError(400, "invalid_input", c.reject);
    if (c.masked) throw new HttpError(400, "contact_blocked", "연락처는 적을 수 없어요. 참여한 사람끼리 채팅으로 이야기해요.");
  }
  const venue = matchVenue(post.title, post.body);
  const [pinHash, keep] = await Promise.all([hashPin(input.pin), keepCount(fp, who)]);
  return tx(async (c) => {
    const g = await c.query<{ id: string }>(
      `INSERT INTO event_groups (post_id, kind, day, meet_time, place, intro, capacity, member_count, venue_lat, venue_lng, creator_fingerprint)
       VALUES ($1, 'open', $2, $3, $4, $5, $6, 1, $7, $8, $9) RETURNING id::text`,
      [postId, input.day, input.meetTime, input.place, input.intro, input.capacity, venue?.lat ?? null, venue?.lng ?? null, fp],
    );
    const id = g.rows[0]!.id;
    const m = await c.query<{ id: string }>(
      "INSERT INTO event_group_members (group_id, fingerprint, nickname, pin_hash, keep_count) VALUES ($1, $2, $3, $4, $5) RETURNING id::text",
      [id, fp, input.nickname, pinHash, keep],
    );
    return { id, token: eventMemberRef(m.rows[0]!.id) };
  });
}

export type PublicGroup = { id: string; day: string; meet_time: string; place: string; intro: string; capacity: number; member_count: number; closed: boolean };

/** 글 아래 모집 목록 (가려진 것 빼고, 지난 날짜는 빼고) */
export async function listOpenGroups(postId: string, now = new Date()): Promise<PublicGroup[]> {
  if (!ID.test(postId)) return [];
  const rows = await query<GroupRow>(
    `SELECT ${GROUP_COLS} FROM event_groups WHERE post_id = $1 AND kind = 'open' AND NOT is_hidden AND day >= $2::date ORDER BY day, meet_time, id LIMIT 30`,
    [postId, kstToday(now)],
  );
  return rows.map((g) => ({ id: g.id, day: g.day, meet_time: g.meet_time, place: g.place, intro: g.intro, capacity: g.capacity, member_count: g.member_count, closed: groupClosed(g, now) }));
}

export async function autoGroupCount(postId: string): Promise<number> {
  if (!ID.test(postId)) return 0;
  const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM event_groups WHERE post_id = $1 AND kind = 'auto' AND NOT is_hidden", [postId]);
  return r?.n ?? 0;
}
export const showAutoProof = (n: number) => n >= GROUPS_SHOW_MIN;

/**
 * 참여하기 / 다시 들어오기. 같은 닉네임이 이미 있으면 PIN 이 맞을 때 증표만 다시 준다 (다른 기기에서 채팅 보기).
 * 새 참여는 모집(open)만, 정원·날짜 안에서. 자동 조는 배치만 사람을 넣는다.
 */
export async function joinGroup(groupId: string, fp: string, nickname: string, pin: string, now = new Date(), agree = true): Promise<{ token: string }> {
  if (!ID.test(groupId)) throw notFound("모집");
  await assertGroupInteractive(groupId);
  const [existing] = await query<{ id: string; pin_hash: string; left_at: string | null; is_hidden: boolean }>(
    "SELECT id::text, pin_hash, left_at, is_hidden FROM event_group_members WHERE group_id = $1 AND nickname = $2",
    [groupId, nickname],
  );
  if (existing && !existing.left_at) {
    await assertPin(`eg:${existing.id}`, fp, pin, existing.pin_hash);
    return { token: eventMemberRef(existing.id) };
  }
  if (!agree) throw new HttpError(400, "invalid_input", "노쇼 규칙을 확인하고 체크해 주세요.");
  const who = { nickname, pin };
  await assertNoPenalty(fp, who, now);
  const keep = await keepCount(fp, who);
  const pinHash = await hashPin(pin);
  return tx(async (c) => {
    const g = (await c.query<GroupRow>(`SELECT ${GROUP_COLS} FROM event_groups WHERE id = $1 FOR UPDATE`, [groupId])).rows[0];
    if (!g || g.is_hidden) throw notFound("모집");
    if (g.kind !== "open") throw new HttpError(403, "auto_group", "자동 조는 편성된 사람만 들어갈 수 있어요.");
    if (groupClosed(g, now)) throw new HttpError(409, "group_closed", "마감된 모집이에요.");
    const mine = await c.query("SELECT 1 FROM event_group_members WHERE group_id = $1 AND fingerprint = $2 AND left_at IS NULL", [groupId, fp]);
    if (mine.rowCount) throw new HttpError(409, "already_member", "이미 참여한 모집이에요. 원래 닉네임과 PIN 으로 들어와 주세요.");
    let memberId: string;
    if (existing) {
      // 나갔던 닉네임: PIN 이 맞으면 다시
      if (!(await verifyPin(pin, existing.pin_hash))) throw new HttpError(409, "nickname_taken", "이 모집에서 이미 쓰인 닉네임이에요.");
      await c.query("UPDATE event_group_members SET left_at = NULL, late_cancel = false, fingerprint = $2 WHERE id = $1", [existing.id, fp]);
      memberId = existing.id;
    } else {
      try {
        memberId = (
          await c.query<{ id: string }>(
            "INSERT INTO event_group_members (group_id, fingerprint, nickname, pin_hash, keep_count) VALUES ($1, $2, $3, $4, $5) RETURNING id::text",
            [groupId, fp, nickname, pinHash, keep],
          )
        ).rows[0]!.id;
      } catch (e) {
        if (isUniqueViolation(e)) throw new HttpError(409, "nickname_taken", "이 모집에서 이미 쓰인 닉네임이에요.");
        throw e;
      }
    }
    await c.query("UPDATE event_groups SET member_count = member_count + 1 WHERE id = $1", [groupId]);
    return { token: eventMemberRef(memberId) };
  });
}

type MemberRow = {
  id: string; group_id: string; nickname: string; left_at: string | null; checked_in_at: string | null; geo_ok: boolean;
  show_badge: boolean; keep_count: number; is_hidden: boolean; outcome: Outcome | null; fingerprint: string;
};

async function memberOf(groupId: string, memberId: string | null): Promise<MemberRow> {
  if (!memberId || !ID.test(groupId)) throw new HttpError(403, "not_member", "참여한 사람만 볼 수 있어요.");
  const [m] = await query<MemberRow>(
    `SELECT id::text, group_id::text, nickname, left_at, checked_in_at, geo_ok, show_badge, keep_count, is_hidden, outcome, fingerprint
       FROM event_group_members WHERE id = $1 AND group_id = $2`,
    [memberId, groupId],
  );
  if (!m || m.left_at) throw new HttpError(403, "not_member", "참여한 사람만 볼 수 있어요.");
  if (m.is_hidden) throw new HttpError(403, "member_hidden", "신고가 쌓여 이 모임에서 가려졌어요.");
  return m;
}

async function groupRow(groupId: string): Promise<GroupRow> {
  const [g] = await query<GroupRow>(`SELECT ${GROUP_COLS} FROM event_groups WHERE id = $1`, [groupId]);
  if (!g) throw notFound("모집");
  if (g.is_hidden) throw new HttpError(410, "group_hidden", "신고가 쌓여 가려진 모임이에요.");
  return g;
}

export type GroupView = {
  group: GroupRow & { line: string; title: string; post_title: string; closed: boolean };
  me: { id: string; nickname: string; checked_in: boolean; geo_ok: boolean; show_badge: boolean; badge: string | null };
  members: { id: string; nickname: string; checked_in: boolean; confirmed_by_me: boolean; badge: string | null }[];
  chat_open: boolean;
  chat_opens_at: string;
  checkin: { open: boolean; from: string; to: string };
  free_cancel_until: string;
  messages: { id: string; nickname: string; body: string; mine: boolean; created_at: string }[];
};

/** 조원 화면: 모임 정보·조원·(열렸으면) 채팅 */
export async function groupView(groupId: string, memberId: string | null, now = new Date()): Promise<GroupView> {
  const me = await memberOf(groupId, memberId);
  const g = await groupRow(groupId);
  const [post] = await query<{ title: string }>("SELECT title FROM posts WHERE id = $1", [g.post_id]);
  const members = await query<MemberRow & { confirmed_by_me: boolean }>(
    `SELECT m.id::text, m.nickname, m.checked_in_at, m.show_badge, m.keep_count,
            EXISTS (SELECT 1 FROM event_group_confirms c WHERE c.member_id = m.id AND c.by_member_id = $2) AS confirmed_by_me
       FROM event_group_members m WHERE m.group_id = $1 AND m.left_at IS NULL AND NOT m.is_hidden ORDER BY m.id`,
    [groupId, me.id],
  );
  const open = chatOpen(g, now);
  const messages = open
    ? await query<{ id: string; nickname: string; body: string; member_id: string | null; created_at: string }>(
        `SELECT x.id::text, x.nickname, x.body, x.member_id::text, x.created_at FROM event_group_messages x
           LEFT JOIN event_group_members m ON m.id = x.member_id
          WHERE x.group_id = $1 AND NOT x.is_hidden AND NOT COALESCE(m.is_hidden, false) ORDER BY x.id DESC LIMIT 200`,
        [groupId],
      )
    : [];
  const w = checkinWindow(g.day, g.meet_time);
  return {
    group: { ...g, line: placeLine(g), title: g.kind === "auto" ? `${g.seq}조` : g.place, post_title: post?.title ?? "", closed: groupClosed(g, now) },
    me: { id: me.id, nickname: me.nickname, checked_in: !!me.checked_in_at, geo_ok: me.geo_ok, show_badge: me.show_badge, badge: keepBadge(me.keep_count) },
    members: members.map((m) => ({
      id: m.id,
      nickname: m.nickname,
      checked_in: !!m.checked_in_at,
      confirmed_by_me: m.confirmed_by_me,
      badge: m.show_badge ? keepBadge(m.keep_count) : null,
    })),
    chat_open: open,
    chat_opens_at: chatOpensAt(g.day).toISOString(),
    checkin: { open: inCheckin(g.day, g.meet_time, now), from: w.from.toISOString(), to: w.to.toISOString() },
    free_cancel_until: freeCancelUntil(g.day).toISOString(),
    messages: messages.reverse().map((x) => ({ id: x.id, nickname: x.nickname, body: x.body, mine: x.member_id === me.id, created_at: x.created_at })),
  };
}

export async function postGroupMessage(groupId: string, memberId: string | null, body: string, now = new Date()): Promise<{ masked: boolean }> {
  const me = await memberOf(groupId, memberId);
  const g = await groupRow(groupId);
  if (!chatOpen(g, now)) throw new HttpError(403, "chat_closed", "하루 전에 채팅이 열려요.");
  const c = cleanChat(body.trim());
  if (c.reject) throw new HttpError(400, "invalid_input", c.reject);
  if (!c.text.trim()) throw new HttpError(400, "invalid_input", "내용을 입력해 주세요.");
  await query("INSERT INTO event_group_messages (group_id, member_id, nickname, body, masked) VALUES ($1, $2, $3, $4, $5)", [groupId, me.id, me.nickname, c.text.slice(0, 500), c.masked]);
  return { masked: c.masked };
}

/** 나가기. 전날 18시 뒤에 나가면 늦은 취소로 남는다 (조 전체가 도착 확인을 안 썼으면 나중에 제한하지 않음) */
export async function leaveGroup(groupId: string, memberId: string | null, now = new Date()): Promise<{ late: boolean }> {
  const me = await memberOf(groupId, memberId);
  const g = await groupRow(groupId);
  const late = now > freeCancelUntil(g.day);
  await tx(async (c) => {
    const r = await c.query("UPDATE event_group_members SET left_at = $2, late_cancel = $3 WHERE id = $1 AND left_at IS NULL RETURNING 1", [me.id, now.toISOString(), late]);
    if (r.rowCount) await c.query("UPDATE event_groups SET member_count = greatest(member_count - 1, 0) WHERE id = $1", [groupId]);
    if (g.kind === "auto") await c.query("DELETE FROM event_pool WHERE member_id = $1", [me.id]);
  });
  return { late };
}

/** 📍 도착했어요. 좌표가 오면 500m 안인지만 저장하고 좌표는 버린다 */
export async function checkIn(groupId: string, memberId: string | null, coords: { lat: number; lng: number } | null, now = new Date()): Promise<{ geo_ok: boolean }> {
  const me = await memberOf(groupId, memberId);
  const g = await groupRow(groupId);
  if (!inCheckin(g.day, g.meet_time, now)) throw new HttpError(409, "checkin_closed", "만날 시각 30분 전부터 30분 뒤까지만 누를 수 있어요.");
  const geo = !!coords && g.venue_lat !== null && g.venue_lng !== null && distanceM(coords.lat, coords.lng, g.venue_lat, g.venue_lng) <= GEO_RADIUS_M;
  await query("UPDATE event_group_members SET checked_in_at = COALESCE(checked_in_at, $2), geo_ok = geo_ok OR $3 WHERE id = $1", [me.id, now.toISOString(), geo]);
  return { geo_ok: geo || me.geo_ok };
}

/** 만났어요: 같은 조원을 확인해 준다 (창 안에서만, 자기 자신은 안 됨) */
export async function confirmMet(groupId: string, memberId: string | null, targetId: string, now = new Date()): Promise<void> {
  const me = await memberOf(groupId, memberId);
  const g = await groupRow(groupId);
  if (!inCheckin(g.day, g.meet_time, now)) throw new HttpError(409, "checkin_closed", "만날 시각 30분 전부터 30분 뒤까지만 누를 수 있어요.");
  if (!ID.test(targetId) || targetId === me.id) throw new HttpError(400, "invalid_input", "다른 조원을 골라 주세요.");
  const [t] = await query("SELECT 1 FROM event_group_members WHERE id = $1 AND group_id = $2 AND left_at IS NULL", [targetId, groupId]);
  if (!t) throw notFound("조원");
  await query("INSERT INTO event_group_confirms (member_id, by_member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [targetId, me.id]);
}

export async function setShowBadge(groupId: string, memberId: string | null, on: boolean): Promise<void> {
  const me = await memberOf(groupId, memberId);
  await query("UPDATE event_group_members SET show_badge = $2 WHERE id = $1", [me.id, on]);
}

export type ReportTarget = "group" | "message" | "member" | "place";

/**
 * 신고. 모임(group)은 누구나(목록에 보이므로), 메시지·조원·장소는 그 모임 조원만. 같은 대상은 한 브라우저 한 번.
 * group·message·member 는 3건이면 가린다. place(🧭 장소가 이상해요)는 가리지 않고 운영 화면에 올린다.
 */
export async function reportEventTarget(
  groupId: string, fp: string, target: ReportTarget, targetId: string | null, reason: string, memberId: string | null,
): Promise<{ hidden: boolean; already: boolean }> {
  if (!ID.test(groupId)) throw notFound("모집");
  let id = groupId;
  if (target !== "group") {
    const me = await memberOf(groupId, memberId);
    if (target === "message" || target === "member") {
      if (!targetId || !ID.test(targetId)) throw new HttpError(400, "invalid_input", "대상을 골라 주세요.");
      const table = target === "message" ? "event_group_messages" : "event_group_members";
      const [row] = await query(`SELECT 1 FROM ${table} WHERE id = $1 AND group_id = $2`, [targetId, groupId]);
      if (!row) throw notFound("대상");
      if (target === "member" && targetId === me.id) throw new HttpError(400, "invalid_input", "자기 자신은 신고할 수 없어요.");
      id = targetId;
    }
  }
  return tx(async (c) => {
    const ins = await c.query("INSERT INTO event_group_reports (target, target_id, fingerprint, reason) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1", [target, id, fp, reason.slice(0, 200)]);
    if (!ins.rowCount) return { hidden: false, already: true };
    if (target === "place") {
      await c.query("UPDATE event_groups SET place_reports = place_reports + 1 WHERE id = $1", [id]);
      return { hidden: false, already: false };
    }
    const table = target === "group" ? "event_groups" : target === "message" ? "event_group_messages" : "event_group_members";
    const r = await c.query<{ is_hidden: boolean }>(
      `UPDATE ${table} SET report_count = report_count + 1, is_hidden = is_hidden OR report_count + 1 >= $2 WHERE id = $1 RETURNING is_hidden`,
      [id, REPORT_HIDE],
    );
    return { hidden: !!r.rows[0]?.is_hidden, already: false };
  });
}

// ---------------------------------------------------------------------------
// 🙌 조 짜 주세요 (auto)
// ---------------------------------------------------------------------------

export type PoolInput = { day: string; slot: Slot; age: Age; nickname: string; pin: string; subscriptionId?: string | null };

export async function joinPool(postId: string, fp: string, input: PoolInput, now = new Date()): Promise<{ ref: string }> {
  const post = await loadEventPost(postId);
  const span = eventSpan({ id: postId, title: post.title, body: post.body, created_at: post.created_at });
  if (!span) throw new HttpError(400, "no_dates", "행사 날짜를 찾지 못해 조를 짤 수 없어요.");
  if (!poolOpen(span.start, now)) throw new HttpError(409, "pool_closed", "조 신청은 행사 3일 전 12시까지예요.");
  const days = eventDays(post, now) ?? [];
  if (!days.includes(input.day)) throw new HttpError(400, "invalid_input", "행사 날짜 안에서 골라 주세요.");
  const who = { nickname: input.nickname, pin: input.pin };
  await assertNoPenalty(fp, who, now);
  const [pinHash, keep] = await Promise.all([hashPin(input.pin), keepCount(fp, who)]);
  try {
    const [row] = await query<{ id: string }>(
      `INSERT INTO event_pool (post_id, fingerprint, day, slot, age, nickname, pin_hash, subscription_id, keep_count)
       SELECT $1::bigint, $2::char(64), $3::date, $4::text, $5::text, $6::varchar(20), $7::text, $8::bigint, $9::smallint
        WHERE NOT EXISTS (SELECT 1 FROM event_pool WHERE post_id = $1::bigint AND nickname = $6::varchar(20))
       RETURNING id::text`,
      [postId, fp, input.day, input.slot, input.age, input.nickname, pinHash, input.subscriptionId ?? null, keep],
    );
    if (!row) throw new HttpError(409, "nickname_taken", "이 행사 조 신청에 이미 쓰인 닉네임이에요.");
    return { ref: eventPoolRef(row.id) };
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, "already_joined", "이미 조 신청을 했어요.");
    throw e;
  }
}

export type PoolStatus = {
  status: "waiting" | "matched" | "unmatched";
  day: string; slot: Slot; age: Age; nickname: string;
  group: { id: string; seq: number | null; member_count: number; line: string; place: string; meet_time: string; station: string | null } | null;
  token: string | null;
};

/** 신청 증표 → 상태 (편성됐으면 조 채팅 증표도) */
export async function poolStatus(poolId: string): Promise<PoolStatus | null> {
  const [p] = await query<{ status: PoolStatus["status"]; day: string; slot: Slot; age: Age; nickname: string; group_id: string | null; member_id: string | null }>(
    "SELECT status, to_char(day, 'YYYY-MM-DD') AS day, slot, age, nickname, group_id::text, member_id::text FROM event_pool WHERE id = $1",
    [poolId],
  );
  if (!p) return null;
  let group: PoolStatus["group"] = null;
  if (p.group_id) {
    const [g] = await query<GroupRow>(`SELECT ${GROUP_COLS} FROM event_groups WHERE id = $1`, [p.group_id]);
    if (g && !g.is_hidden) group = { id: g.id, seq: g.seq, member_count: g.member_count, line: placeLine(g), place: g.place, meet_time: g.meet_time, station: g.station };
  }
  return { status: p.status, day: p.day, slot: p.slot, age: p.age, nickname: p.nickname, group, token: p.member_id && group ? eventMemberRef(p.member_id) : null };
}

/** 신청 취소 (편성 뒤면 조에서 나가기와 같다) */
export async function cancelPool(poolId: string, now = new Date()): Promise<{ late: boolean }> {
  const [p] = await query<{ group_id: string | null; member_id: string | null }>("SELECT group_id::text, member_id::text FROM event_pool WHERE id = $1", [poolId]);
  if (!p) throw notFound("조 신청");
  if (p.group_id && p.member_id) return leaveGroup(p.group_id, p.member_id, now);
  await query("DELETE FROM event_pool WHERE id = $1", [poolId]);
  return { late: false };
}

// ---------------------------------------------------------------------------
// 배치 (푸시 타이머에 붙어 돈다)
// ---------------------------------------------------------------------------

type PushSub = { id: string; endpoint: string; p256dh: string; auth: string };
type Send = (s: PushSub, m: PushMessage) => Promise<SendResult>;

const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

export function autoGroupPush(name: string, g: { day: string; slot: Slot; seq: number | null; place: string; meet_time: string; station: string | null }, postId: string): PushMessage {
  return {
    title: `🙌 ${name} ${md(g.day)} ${SLOT_LABEL[g.slot]} 조가 짜졌어요`,
    body: placeLine(g),
    url: `/posts/${postId}?from=push#together`,
    tag: `lr-autogroup-${postId}`,
  };
}
export const unmatchedPush = (name: string, postId: string): PushMessage => ({
  title: "이번엔 조가 안 됐어요",
  body: `${name} · 글 아래 같이 가요 모집을 둘러보세요`,
  url: `/posts/${postId}?from=push#together`,
  tag: `lr-autogroup-${postId}`,
});

async function subOf(id: string | null): Promise<PushSub | null> {
  if (!id) return null;
  const [s] = await query<PushSub>("SELECT id::text, endpoint, p256dh, auth FROM push_subscriptions WHERE id = $1", [id]);
  return s ?? null;
}

async function deliver(send: Send, subId: string | null, msg: PushMessage): Promise<boolean> {
  const s = await subOf(subId);
  if (!s) return false;
  const r = await send(s, msg).catch(() => "failed" as SendResult);
  if (r === "gone") await query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
  return r === "sent";
}

/**
 * D-3 12시: 기다리는 신청을 (날짜, 오전/오후, 성인/청소년) 별로 4~6명 조로. 만날 곳·시각은 행사장 표(src/lib/venues.ts)에서 정하고
 * 같은 날짜·시간대 조끼리는 곳을 돌려 쓰거나 10분씩 늦춘다. 편성·미편성 모두 푸시(조용한 시간엔 이 배치가 돌지 않는다).
 */
export async function runAutoGrouping(now = new Date(), opts: { send?: Send } = {}): Promise<{ groups: number; unmatched: number; sent: number }> {
  if (quietHours(now)) return { groups: 0, unmatched: 0, sent: 0 };
  const send: Send = opts.send ?? ((s, m) => sendPush(s, m));
  const posts = await query<{ post_id: string }>("SELECT DISTINCT post_id::text FROM event_pool WHERE status = 'waiting'");
  let groups = 0;
  let unmatchedN = 0;
  let sent = 0;
  const today = kstToday(now);
  for (const { post_id } of posts) {
    const [post] = await query<{ title: string; body: string; created_at: string; is_blinded: boolean }>("SELECT p.title, p.body, p.created_at, (p.is_blinded OR c.info_only OR c.no_matching) AS is_blinded FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.id = $1", [post_id]);
    const span = post ? eventSpan({ id: post_id, ...post }) : null;
    if (post && span && !post.is_blinded && !poolDue(span.start, now)) continue;
    const name = post ? eventName(post.title) : "행사";
    const result = await tx(async (c) => {
      // 같은 글을 두 인스턴스가 동시에 짜지 않게
      await c.query("SELECT pg_advisory_xact_lock(4823150, $1::int)", [Number(post_id) % 2_000_000_000]);
      const entries = (
        await c.query<{ id: string; day: string; slot: Slot; age: Age; created_at: string; fingerprint: string; nickname: string; pin_hash: string; keep_count: number; subscription_id: string | null }>(
          `SELECT id::text, to_char(day, 'YYYY-MM-DD') AS day, slot, age, created_at, fingerprint, nickname, pin_hash, keep_count, subscription_id::text
             FROM event_pool WHERE post_id = $1 AND status = 'waiting' FOR UPDATE`,
          [post_id],
        )
      ).rows;
      const valid = post && span && !post.is_blinded ? entries.filter((e) => e.day >= today) : [];
      const plan = buildAutoGroups(valid);
      const unmatched = [...plan.unmatched, ...entries.filter((e) => !valid.includes(e)).map((e) => e.id)];
      const venue = post ? matchVenue(post.title, post.body) : null;
      const opening = post ? parseOpening(`${post.title}\n${post.body}`) : null;
      const [{ seq }] = (await c.query<{ seq: number }>("SELECT COALESCE(max(seq), 0)::int AS seq FROM event_groups WHERE post_id = $1 AND kind = 'auto'", [post_id])).rows as [{ seq: number }];
      let next = seq;
      const slotIndex = new Map<string, number>();
      for (const r of (await c.query<{ day: string; slot: string; n: number }>("SELECT to_char(day, 'YYYY-MM-DD') AS day, slot, count(*)::int AS n FROM event_groups WHERE post_id = $1 AND kind = 'auto' GROUP BY 1, 2", [post_id])).rows)
        slotIndex.set(`${r.day}|${r.slot}`, r.n);
      const byId = new Map(entries.map((e) => [e.id, e]));
      const notify: { sub: string | null; msg: PushMessage }[] = [];
      for (const pg of plan.groups) {
        const k = `${pg.day}|${pg.slot}`;
        const i = slotIndex.get(k) ?? 0;
        slotIndex.set(k, i + 1);
        const { point, time } = spreadPlace(venue, meetTime(pg.slot, opening), i);
        next++;
        const gid = (
          await c.query<{ id: string }>(
            `INSERT INTO event_groups (post_id, kind, day, meet_time, place, station, capacity, member_count, slot, age, seq, venue_lat, venue_lng)
             VALUES ($1, 'auto', $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11) RETURNING id::text`,
            [post_id, pg.day, time, point.name, point.station, Math.min(pg.ids.length, AUTO_MAX), pg.slot, pg.age, next, venue?.lat ?? null, venue?.lng ?? null],
          )
        ).rows[0]!.id;
        for (const pid of pg.ids) {
          const e = byId.get(pid)!;
          const mid = (
            await c.query<{ id: string }>(
              "INSERT INTO event_group_members (group_id, fingerprint, nickname, pin_hash, keep_count) VALUES ($1, $2, $3, $4, $5) RETURNING id::text",
              [gid, e.fingerprint, e.nickname, e.pin_hash, e.keep_count],
            )
          ).rows[0]!.id;
          await c.query("UPDATE event_pool SET status = 'matched', group_id = $2, member_id = $3 WHERE id = $1", [pid, gid, mid]);
          notify.push({ sub: e.subscription_id, msg: autoGroupPush(name, { day: pg.day, slot: pg.slot, seq: next, place: point.name, meet_time: time, station: point.station }, post_id) });
        }
      }
      if (unmatched.length) await c.query("UPDATE event_pool SET status = 'unmatched' WHERE id = ANY($1::bigint[])", [unmatched]);
      for (const id of unmatched) notify.push({ sub: byId.get(id)?.subscription_id ?? null, msg: unmatchedPush(name, post_id) });
      return { groups: plan.groups.length, unmatched: unmatched.length, notify };
    });
    groups += result.groups;
    unmatchedN += result.unmatched;
    for (const n of result.notify) if (await deliver(send, n.sub, n.msg)) sent++;
  }
  return { groups, unmatched: unmatchedN, sent };
}

export function reminderPush(name: string, count: number, postId: string): PushMessage {
  return {
    title: `🙋 3일 뒤 ${name}${count >= 3 ? ` · 같이 갈 사람 ${count}명` : ""}`,
    body: "",
    url: `/posts/${postId}?from=push`,
    tag: `lr-going-${postId}`,
  };
}

/** 3일 전 알림: 갈 거예요 + 푸시 구독한 사람에게, 시작 3일 전 KST 19~22시 한 번 */
export async function runEventReminders(now = new Date(), opts: { send?: Send } = {}): Promise<{ sent: number }> {
  if (quietHours(now)) return { sent: 0 };
  const send: Send = opts.send ?? ((s, m) => sendPush(s, m));
  const posts = await query<{ id: string; title: string; body: string; created_at: string }>(
    `SELECT p.id::text, p.title, left(p.body, 4000) AS body, p.created_at FROM posts p
      WHERE p.id IN (SELECT post_id FROM event_going WHERE reminded_at IS NULL AND subscription_id IS NOT NULL)
        AND p.title LIKE '[행사]%' AND NOT p.is_blinded
        AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = p.category_id AND (c.info_only OR c.no_matching)) AND p.created_at > $1::timestamptz - interval '150 days'`,
    [now.toISOString()],
  );
  let sent = 0;
  for (const p of posts) {
    const span = eventSpan(p);
    if (!span || !reminderDue(span.start, now)) continue;
    const [{ n }] = (await query<{ n: number }>("SELECT count(*)::int AS n FROM event_going WHERE post_id = $1", [p.id])) as [{ n: number }];
    // 먼저 표시하고 보낸다 (여러 번 돌거나 실패해도 한 번만)
    const rows = await query<{ subscription_id: string }>(
      "UPDATE event_going SET reminded_at = $2 WHERE post_id = $1 AND reminded_at IS NULL AND subscription_id IS NOT NULL RETURNING subscription_id::text",
      [p.id, now.toISOString()],
    );
    const msg = reminderPush(eventName(p.title), n, p.id);
    for (const r of rows) if (await deliver(send, r.subscription_id, msg)) sent++;
  }
  return { sent };
}

/**
 * 도착 확인 창이 끝난 모임의 결과를 정하고 노쇼·늦은 취소를 기록한다 (다른 사람에게는 보이지 않는다).
 */
export async function settleGroups(now = new Date()): Promise<{ settled: number; penalties: number }> {
  const groups = await query<GroupRow>(`SELECT ${GROUP_COLS} FROM event_groups WHERE settled_at IS NULL AND day <= $1::date ORDER BY day LIMIT 200`, [kstToday(now)]);
  let settled = 0;
  let penalties = 0;
  for (const g of groups) {
    if (checkinWindow(g.day, g.meet_time).to >= now) continue;
    await tx(async (c) => {
      const lock = await c.query("UPDATE event_groups SET settled_at = $2 WHERE id = $1 AND settled_at IS NULL RETURNING 1", [g.id, now.toISOString()]);
      if (!lock.rowCount) return;
      settled++;
      if (g.is_hidden) return;
      const members = (
        await c.query<{ id: string; left_at: string | null; late_cancel: boolean; checked_in_at: string | null; geo_ok: boolean; confirms: number; fingerprint: string; nickname: string; pin_hash: string }>(
          `SELECT m.id::text, m.left_at, m.late_cancel, m.checked_in_at, m.geo_ok, m.fingerprint, m.nickname, m.pin_hash,
                  (SELECT count(*)::int FROM event_group_confirms x JOIN event_group_members b ON b.id = x.by_member_id
                    WHERE x.member_id = m.id AND b.left_at IS NULL) AS confirms
             FROM event_group_members m WHERE m.group_id = $1 AND NOT m.is_hidden`,
          [g.id],
        )
      ).rows;
      const out = settleOutcomes(members.map((m) => ({ ...m, checked_in: !!m.checked_in_at })));
      for (const o of out) {
        if (!o.outcome) continue;
        const m = members.find((x) => x.id === o.id)!;
        await c.query("UPDATE event_group_members SET outcome = $2 WHERE id = $1", [o.id, o.outcome]);
        if (o.outcome === "noshow" || o.outcome === "late_cancel") {
          await c.query("INSERT INTO event_penalties (fingerprint, nickname, pin_hash, kind, group_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [m.fingerprint, m.nickname, m.pin_hash, o.outcome, g.id, now.toISOString()]);
          penalties++;
        }
      }
    });
  }
  return { settled, penalties };
}

// ---------------------------------------------------------------------------
// 운영 화면
// ---------------------------------------------------------------------------

export type PlaceReport = { id: string; post_id: string; title: string; seq: number | null; place: string; meet_time: string; day: string; place_reports: number };

export async function listPlaceReports(): Promise<PlaceReport[]> {
  return query<PlaceReport>(
    `SELECT g.id::text, g.post_id::text, p.title, g.seq, g.place, g.meet_time, to_char(g.day, 'YYYY-MM-DD') AS day, g.place_reports
       FROM event_groups g JOIN posts p ON p.id = g.post_id WHERE g.place_reports > 0 ORDER BY g.day DESC, g.place_reports DESC LIMIT 100`,
  );
}

export type GoingStats = { toggles: number; groups: number; joins: number; pool: number; auto: number };

/** 기간 안에 새로 생긴 갈 거예요·모집·참여·조 신청·자동 조 (지금 남아 있는 것 기준) */
export async function goingStats(fromDay: string, toDay: string): Promise<GoingStats> {
  const [r] = await query<GoingStats>(
    `SELECT (SELECT count(*)::int FROM event_going WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN $1::date AND $2::date) AS toggles,
            (SELECT count(*)::int FROM event_groups WHERE kind = 'open' AND (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN $1::date AND $2::date) AS groups,
            (SELECT count(*)::int FROM event_group_members m JOIN event_groups g ON g.id = m.group_id
              WHERE g.kind = 'open' AND m.fingerprint IS DISTINCT FROM g.creator_fingerprint
                AND (m.created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN $1::date AND $2::date) AS joins,
            (SELECT count(*)::int FROM event_pool WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN $1::date AND $2::date) AS pool,
            (SELECT count(*)::int FROM event_groups WHERE kind = 'auto' AND (created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN $1::date AND $2::date) AS auto`,
    [fromDay, toDay],
  );
  return r ?? { toggles: 0, groups: 0, joins: 0, pool: 0, auto: 0 };
}
