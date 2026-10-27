/**
 * 📰 오늘 브리핑 (10/27 대표님 "우리 방에만 오면 중요하고 기본적인거는 다 알았다는 느낌이 들게. 장 전 아침, 장 끝나고 오후, 저녁").
 * 예약 작업이 노방장 이름으로 올리는 [정보] 글의 제목 꼬리말로 종류를 가른다. 방 맨 위에 오늘 것만 한 줄로.
 *   주식: ☀️ 장 전(08:17) · 🚨 속보(장중, 있을 때만) · 📊 마감(15:47) · 🌙 저녁(19:43)
 *   미국주식방: 🇺🇸 간밤 미국장(07:07) · 🌙 오늘 밤 미국장(21:13)
 *   적립식 투자방: 💰 이번 주 한 장(토 09:13) · 📅 지난달 한 장(매달 1일 09:23)
 */
import { query } from "../db";

export type BriefingKind = { key: string; label: string; match: string };

export const BRIEFING_KINDS: Record<string, readonly BriefingKind[]> = {
  주식: [
    { key: "pre", label: "☀️ 장 전", match: "장 전 |" },
    { key: "flash", label: "🚨 속보", match: "속보 " },
    { key: "close", label: "📊 마감", match: "장 마감 |" },
    { key: "eve", label: "🌙 저녁", match: "저녁 |" },
  ],
  미국주식방: [
    { key: "us", label: "🇺🇸 간밤 미국장", match: "간밤 미국장 |" },
    { key: "tonight", label: "🌙 오늘 밤", match: "오늘 밤 미국장 |" },
  ],
  "적립식-투자방": [
    { key: "week", label: "💰 이번 주 한 장", match: "이번 주 한 장 |" },
    { key: "month", label: "📅 지난달 한 장", match: "지난달 한 장 |" },
  ],
};

export type Briefing = { key: string; label: string; postId: string; title: string; today: boolean };

/** 이 방의 브리핑: 종류마다 가장 최근 글 하나 (속보는 오늘, 나머지는 최근 35일 안) */
export async function roomBriefings(slug: string): Promise<Briefing[]> {
  const kinds = BRIEFING_KINDS[slug];
  if (!kinds) return [];
  const rows = await query<{ id: string; title: string; today: boolean }>(
    `SELECT p.id::text, p.title,
            (p.created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date AS today
       FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE c.slug = $1 AND p.nickname = '노방장' AND p.title LIKE '[정보]%' AND NOT p.is_blinded
        AND p.created_at > now() - interval '35 days'
      ORDER BY p.created_at DESC LIMIT 60`,
    [slug],
  );
  const out: Briefing[] = [];
  for (const k of kinds) {
    const r = rows.find((x) => x.title.includes(k.match));
    if (!r) continue;
    // 속보는 오늘 것만
    if (k.key === "flash" && !r.today) continue;
    out.push({ key: k.key, label: k.label, postId: r.id, title: r.title.replace(/^\[정보\]\s*/, ""), today: r.today });
  }
  return out;
}
