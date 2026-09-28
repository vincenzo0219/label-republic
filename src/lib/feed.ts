/** Atom 1.0 피드 생성 — 관심 보드를 RSS 리더로 구독할 수 있게 한다 (개인정보 없이 가능한 "구독") */
import { renewalTitle, renewalWhen } from "./renewal-text";
import type { RenewalItem } from "./repo/renewal-feed";
import type { PostCard } from "./types";

export function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!)
    // XML 1.0에서 허용되지 않는 제어 문자 제거
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function buildAtom(opts: {
  id: string;
  title: string;
  subtitle: string;
  selfUrl: string;
  siteUrl: string;
  alternateUrl: string;
  posts: (PostCard & { updated_at?: string })[];
}): string {
  const updated = opts.posts[0]?.updated_at ?? opts.posts[0]?.created_at ?? new Date(0).toISOString();
  const entries = opts.posts
    .map((p) => {
      const url = `${opts.siteUrl}/posts/${p.id}`;
      const lines = p.summary?.lines ?? [p.excerpt.slice(0, 200)];
      const meetup = p.meetup ? `📅 ${new Date(p.meetup.meet_at).toISOString()} · ${p.meetup.location}\n` : "";
      const summary = meetup + lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
      return `  <entry>
    <id>${xmlEscape(url)}</id>
    <title>${xmlEscape((p.post_type === "meetup" ? "[정모] " : "") + p.title)}</title>
    <link href="${xmlEscape(url)}"/>
    <published>${p.created_at}</published>
    <updated>${p.updated_at ?? p.created_at}</updated>
    <author><name>${xmlEscape(p.is_ai_curated ? `${p.nickname} (AI)` : p.nickname)}</name></author>
    <category term="${xmlEscape(p.category.slug)}" label="${xmlEscape(p.category.name)}"/>
    <summary type="text">${xmlEscape(summary)}</summary>
  </entry>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ko">
  <id>${xmlEscape(opts.id)}</id>
  <title>${xmlEscape(opts.title)}</title>
  <subtitle>${xmlEscape(opts.subtitle)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${xmlEscape(opts.selfUrl)}"/>
  <link rel="alternate" type="text/html" href="${xmlEscape(opts.alternateUrl)}"/>
  <updated>${updated}</updated>
  <generator>라벨공화국</generator>
${entries}
</feed>
`;
}

/** 라벨 변경 이력 피드 (Sprint 28) — 항목마다 제품 페이지로 연결 */
export function buildRenewalAtom(opts: { id: string; title: string; selfUrl: string; siteUrl: string; alternateUrl: string; items: RenewalItem[] }): string {
  const updated = opts.items[0]?.confirmed_at ?? new Date(0).toISOString();
  const entries = opts.items
    .map((r) => {
      const url = `${opts.siteUrl}/p/${r.product.id}`;
      const summary = `${renewalWhen(r)} · 새 값 글 ${r.new_reports}개(작성자 ${r.new_authors}명${r.new_photos ? `, 사진 근거 ${r.new_photos}` : ""}). 이용자 제보를 규칙으로 정리한 결과이며 제조사 발표가 아닙니다.`;
      return `  <entry>
    <id>${xmlEscape(`${opts.siteUrl}/renewals#r${r.id}`)}</id>
    <title>${xmlEscape(renewalTitle(r))}</title>
    <link href="${xmlEscape(url)}"/>
    <published>${r.confirmed_at}</published>
    <updated>${r.confirmed_at}</updated>
    <author><name>라벨공화국</name></author>
    <category term="${xmlEscape(r.category.slug)}" label="${xmlEscape(r.category.name)}"/>
    <summary type="text">${xmlEscape(summary)}</summary>
  </entry>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ko">
  <id>${xmlEscape(opts.id)}</id>
  <title>${xmlEscape(opts.title)}</title>
  <subtitle>라벨 표시값이 바뀐 것으로 보이는 제품 — 이용자 제보를 규칙으로 정리한 기록</subtitle>
  <link rel="self" type="application/atom+xml" href="${xmlEscape(opts.selfUrl)}"/>
  <link rel="alternate" type="text/html" href="${xmlEscape(opts.alternateUrl)}"/>
  <updated>${updated}</updated>
  <generator>라벨공화국</generator>
${entries}
</feed>
`;
}

export function atomResponse(xml: string): Response {
  return new Response(xml, {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
