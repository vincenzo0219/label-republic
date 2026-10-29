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

export type HiddenRow = { type: "post" | "comment" | "neo" | "gig" | "game"; id: string; room: string; text: string; url: string; reason: string; evidence: string; hidden_at: string };

/**
 * 🧹 올린 직후 조롱·도배로 바로 가린 것(troll) + 운영자가 가린 것(operator), 최근 days 일. 쓴 사람에게만 보이는 상태라
 * 운영자가 보고 오판이면 /admin 에서 한 번에 다시 보이게 한다 (10/29)
 */
export async function listAutoHidden(days = 7, limit = 100): Promise<HiddenRow[]> {
  return query<HiddenRow>(
    `SELECT * FROM (
       SELECT 'post' AS type, p.id::text AS id, c.name AS room, left(p.title || ' ' || p.body, 120) AS text, '/posts/' || p.id AS url,
              p.ai_hidden_reason AS reason, p.ai_hidden_note AS evidence, p.ai_hidden_at AS hidden_at
         FROM posts p JOIN categories c ON c.id = p.category_id
        WHERE p.ai_hidden_reason IN ('troll', 'operator') AND p.ai_hidden_at > now() - make_interval(days => $1)
       UNION ALL
       SELECT 'comment', cm.id::text, c.name, left(cm.body, 120),
              CASE WHEN p.seed_key LIKE 'roomchat:%' THEN '/c/' || c.slug || '#c' || cm.id ELSE '/posts/' || p.id || '#c' || cm.id END,
              cm.ai_hidden_reason, cm.ai_hidden_note, cm.ai_hidden_at
         FROM comments cm JOIN posts p ON p.id = cm.post_id JOIN categories c ON c.id = p.category_id
        WHERE cm.ai_hidden_reason IN ('troll', 'operator') AND cm.ai_hidden_at > now() - make_interval(days => $1)
       UNION ALL
       SELECT 'neo', i.id::text, '💳 넣어둬', left(i.title || ' ' || i.reason, 120), '/neo/' || i.id, i.hidden_reason, '', i.hidden_at
         FROM neo_items i WHERE i.hidden_reason IN ('troll', 'operator') AND i.hidden_at > now() - make_interval(days => $1)
       UNION ALL
       SELECT 'gig', g.id::text, '📋 대강·구인', left(concat_ws(' · ', g.studio, g.notes), 120), '/gigs/' || g.id, g.ai_hidden_reason, g.ai_hidden_note, g.ai_hidden_at
         FROM gig_listings g WHERE g.ai_hidden_reason IN ('troll', 'operator') AND g.ai_hidden_at > now() - make_interval(days => $1)
       UNION ALL
       SELECT 'game', t.id::text, '🎾 테니스 게임', left(concat_ws(' · ', t.court, t.notes), 120), '${TENNIS_GAMES_URL}', t.ai_hidden_reason, '', t.ai_hidden_at
         FROM tennis_games t WHERE t.ai_hidden_reason IN ('troll', 'operator') AND t.ai_hidden_at > now() - make_interval(days => $1)
     ) x ORDER BY hidden_at DESC LIMIT $2`,
    [days, limit],
  );
}

export type DuplicateRow = { type: "post" | "comment" | "neo"; text: string; count: number; authors: number; ids: string[]; room: string; last_at: string };

/**
 * 🔁 똑같은 글을 여러 번 (10/29 대표님 "도배는 놔두고, 똑같은 글을 여러번 올리면 자동점검때 보고"). 보고만 하고 손대지 않는다.
 * 공백·문장부호를 빼고 같은 내용이 최근 days 일 안에 2번 이상이면 (같은 사람이든 여러 사람이든). 운영 닉네임·AI 글은 뺀다
 */
export async function listDuplicates(days = 1, limit = 50): Promise<DuplicateRow[]> {
  const norm = (col: string) => `lower(regexp_replace(${col}, '[[:space:][:punct:]]', '', 'g'))`;
  return query<DuplicateRow>(
    `SELECT * FROM (
       SELECT 'post' AS type, left(min(p.title), 80) AS text, count(*)::int AS count, count(DISTINCT coalesce(p.author_fingerprint, p.nickname))::int AS authors,
              array_agg(p.id::text ORDER BY p.id) AS ids, min(c.name) AS room, max(p.created_at) AS last_at
         FROM posts p JOIN categories c ON c.id = p.category_id
        WHERE p.created_at > now() - make_interval(days => $1) AND NOT p.is_ai_curated AND p.author_fingerprint IS NOT NULL
        GROUP BY ${norm("p.title || p.body")} HAVING count(*) >= 2 AND length(${norm("min(p.title) || min(p.body)")}) >= 4
       UNION ALL
       SELECT 'comment', left(min(cm.body), 80), count(*)::int, count(DISTINCT coalesce(cm.author_fingerprint, cm.nickname))::int,
              array_agg(cm.id::text ORDER BY cm.id), min(c.name), max(cm.created_at)
         FROM comments cm JOIN posts p ON p.id = cm.post_id JOIN categories c ON c.id = p.category_id
        WHERE cm.created_at > now() - make_interval(days => $1) AND NOT cm.is_ai_curated AND cm.author_fingerprint IS NOT NULL
        GROUP BY ${norm("cm.body")} HAVING count(*) >= 2 AND length(${norm("min(cm.body)")}) >= 6
       UNION ALL
       SELECT 'neo', left(min(i.title), 80), count(*)::int, count(DISTINCT i.owner_hash)::int, array_agg(i.id::text ORDER BY i.id), '💳 넣어둬', max(i.created_at)
         FROM neo_items i WHERE i.created_at > now() - make_interval(days => $1) AND length(${norm("i.title")}) >= 2
        GROUP BY ${norm("i.title")} HAVING count(*) >= 2
     ) x ORDER BY count DESC, last_at DESC LIMIT $2`,
    [days, limit],
  );
}
