/**
 * 🚩 신고 모아 보기 (10/29 대표님 "신고하면 가려지는게 아니라 나한테 보고하는걸로"). 신고는 아무것도 가리지 않고
 * 여기 모여 /admin "🚩 신고 들어온 것"과 GET /api/admin/reports 로 운영자에게 간다. 가리는 건 운영자가 정한다.
 * 종류: 글·댓글(수다방 말 포함)·넣어둬·대강·구인·테니스 게임·같이 가요(모집·메시지·조원·장소)·정정 제안
 */
import { query } from "../db";
import { getRules } from "./rules";

export type ReportType = "post" | "comment" | "neo" | "gig" | "game" | "group" | "correction";
export type ReportRow = {
  type: ReportType;
  id: string;
  room: string;
  text: string;
  url: string;
  reports: number;
  reasons: string;
  last_at: string;
  hidden: boolean;
};

const TENNIS_GAMES_URL = `/c/${encodeURIComponent("테니스-덕후방")}?tab=games`;

/** 종류별 신고를 대상 하나당 한 줄로 (최근 days 일) */
const UNION = `
  SELECT 'post' AS type, p.id::text AS id, c.name AS room, p.title AS text, '/posts/' || p.id AS url,
         count(*)::int AS reports, string_agg(DISTINCT nullif(r.reason, ''), ' / ') AS reasons, max(r.created_at) AS last_at, p.is_blinded AS hidden
    FROM reports r JOIN posts p ON p.id = r.post_id JOIN categories c ON c.id = p.category_id
   WHERE r.voided_at IS NULL AND r.created_at > now() - make_interval(days => $1)
   GROUP BY p.id, c.name
  UNION ALL
  SELECT 'comment', cm.id::text, c.name, cm.body,
         CASE WHEN p.seed_key LIKE 'roomchat:neo:%' THEN '/neo/' || substr(p.seed_key, 14) || '#talk'
              WHEN p.seed_key LIKE 'roomchat:%' THEN '/c/' || c.slug || '/chat#c' || cm.id
              ELSE '/posts/' || p.id || '#c' || cm.id END,
         count(*)::int, string_agg(DISTINCT nullif(r.reason, ''), ' / '), max(r.created_at), cm.ai_hidden_at IS NOT NULL
    FROM comment_reports r JOIN comments cm ON cm.id = r.comment_id JOIN posts p ON p.id = cm.post_id JOIN categories c ON c.id = p.category_id
   WHERE r.created_at > now() - make_interval(days => $1)
   GROUP BY cm.id, c.name, c.slug, p.id, p.seed_key
  UNION ALL
  SELECT 'neo', i.id::text, '💳 넣어둬', i.title, '/neo/' || i.id, count(*)::int, NULL, max(r.created_at), i.is_hidden
    FROM neo_reports r JOIN neo_items i ON i.id = r.item_id
   WHERE r.created_at > now() - make_interval(days => $1)
   GROUP BY i.id
  UNION ALL
  SELECT 'gig', g.id::text, '📋 대강·구인', concat_ws(' · ', g.studio, g.class_type, g.notes), '/gigs/' || g.id,
         count(*)::int, string_agg(DISTINCT nullif(r.reason, ''), ' / '), max(r.created_at), g.ai_hidden_reason IS NOT NULL
    FROM gig_reports r JOIN gig_listings g ON g.id = r.gig_id
   WHERE r.created_at > now() - make_interval(days => $1)
   GROUP BY g.id
  UNION ALL
  SELECT 'game', t.id::text, '🎾 테니스 게임', concat_ws(' · ', t.court, t.game_type, t.notes), '${TENNIS_GAMES_URL}',
         count(*)::int, string_agg(DISTINCT nullif(r.reason, ''), ' / '), max(r.created_at), t.ai_hidden_reason IS NOT NULL
    FROM tennis_game_reports r JOIN tennis_games t ON t.id = r.game_id
   WHERE r.created_at > now() - make_interval(days => $1)
   GROUP BY t.id
  UNION ALL
  SELECT 'group', r.target || ':' || r.target_id, '🙋 같이 가요',
         CASE r.target WHEN 'group' THEN coalesce(g.intro, '') WHEN 'place' THEN '장소: ' || coalesce(g.place, '')
                       WHEN 'message' THEN coalesce(m.body, '') ELSE '조원: ' || coalesce(mb.nickname, '') END,
         '/posts/' || coalesce(g.post_id, gm.post_id, gb.post_id),
         count(*)::int, string_agg(DISTINCT nullif(r.reason, ''), ' / '), max(r.created_at),
         coalesce(CASE r.target WHEN 'group' THEN g.is_hidden WHEN 'message' THEN m.is_hidden WHEN 'member' THEN mb.is_hidden END, false)
    FROM event_group_reports r
    LEFT JOIN event_groups g ON r.target IN ('group', 'place') AND g.id = r.target_id
    LEFT JOIN event_group_messages m ON r.target = 'message' AND m.id = r.target_id
    LEFT JOIN event_groups gm ON gm.id = m.group_id
    LEFT JOIN event_group_members mb ON r.target = 'member' AND mb.id = r.target_id
    LEFT JOIN event_groups gb ON gb.id = mb.group_id
   WHERE r.created_at > now() - make_interval(days => $1)
   GROUP BY r.target, r.target_id, g.intro, g.place, g.post_id, g.is_hidden, m.body, m.is_hidden, gm.post_id, mb.nickname, mb.is_hidden, gb.post_id
  UNION ALL
  SELECT 'correction', co.id::text, c.name, co.proposal, '/posts/' || co.post_id, count(*)::int, NULL, max(r.created_at), co.is_hidden
    FROM correction_reports r JOIN corrections co ON co.id = r.correction_id JOIN posts p ON p.id = co.post_id JOIN categories c ON c.id = p.category_id
   WHERE r.created_at > now() - make_interval(days => $1)
   GROUP BY co.id, c.name`;

/** 최근 신고 (최근 신고 순). type·id 를 주면 그 대상 하나만 */
export async function listReports(opts: { days?: number; limit?: number; type?: ReportType; id?: string } = {}): Promise<ReportRow[]> {
  return query<ReportRow>(
    `SELECT type, id, room, left(regexp_replace(text, '\\s+', ' ', 'g'), 120) AS text, url, reports, coalesce(reasons, '') AS reasons, last_at, hidden
       FROM (${UNION}) x
      WHERE ($3::text IS NULL OR type = $3) AND ($4::text IS NULL OR id = $4)
      ORDER BY last_at DESC LIMIT $2`,
    [opts.days ?? 30, opts.limit ?? 100, opts.type ?? null, opts.id ?? null],
  );
}

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  post: "글",
  comment: "댓글",
  neo: "넣어둬",
  gig: "대강·구인",
  game: "테니스 게임",
  group: "같이 가요",
  correction: "정정 제안",
};

/**
 * 운영자 화면·API용: 서로 다른 신고가 규칙 값(글 post_blind_reports, 정정 제안 correction_hide_reports) 이상이면
 * priority — 운영자가 먼저 본다 (규칙 이름은 예전 자동 가림 기준 그대로). 우선 먼저, 그다음 최근 신고 순
 */
export async function operatorReports(days = 7, limit = 100): Promise<(ReportRow & { priority: boolean })[]> {
  const [rows, rules] = await Promise.all([listReports({ days, limit }), getRules()]);
  return rows
    .map((r) => ({ ...r, priority: r.reports >= (r.type === "correction" ? rules.correction_hide_reports : rules.post_blind_reports) }))
    .sort((a, b) => Number(b.priority) - Number(a.priority) || Date.parse(b.last_at) - Date.parse(a.last_at));
}
