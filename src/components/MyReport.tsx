"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMeetAt } from "@/components/Meetup";
import { PostCard } from "@/components/PostCard";
import { getInterests, getSeenAt, onInterestsChange, setInterests, setSeenAt } from "@/lib/interests";
import type { Report } from "@/lib/repo/report";
import { getWatchedPosts, getWatchedProducts, reconcile, toggleWatchPost, toggleWatchProduct } from "@/lib/watchlist";
import { InstallPrompt } from "./InstallPrompt";
import { PushSettings } from "./PushSettings";
import { WatchedPosts, WatchedProducts } from "./WatchUpdates";

type Board = { slug: string; name: string };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * 내 리포트: 관심 보드의 지난 확인 이후 새 글·다가오는 정모·주간 다이제스트.
 * 관심 보드와 확인 시각은 브라우저에만 저장되며, 리포트를 연 시각이 다음 번의 기준 시각이 된다.
 */
export function MyReport({ allBoards }: { allBoards: Board[] }) {
  const [interests, setLocal] = useState<string[] | null>(null);
  const [watched, setWatched] = useState<{ products: string[]; posts: string[] }>({ products: [], posts: [] });
  const [since, setSince] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const openedAt = useRef(new Date().toISOString());
  const marked = useRef(false);

  useEffect(() => {
    setSince(getSeenAt());
    setLocal(getInterests());
    setWatched({ products: getWatchedProducts(), posts: getWatchedPosts() });
    // 내용이 같은 변경 알림(확인 시각 저장 등)으로는 다시 불러오지 않는다
    return onInterestsChange(() => {
      const next = getInterests();
      setLocal((cur) => (cur && cur.join(",") === next.join(",") ? cur : next));
      const w = { products: getWatchedProducts(), posts: getWatchedPosts() };
      setWatched((cur) => (cur.products.join(",") === w.products.join(",") && cur.posts.join(",") === w.posts.join(",") ? cur : w));
    });
  }, []);

  const load = useCallback(async (boards: string[], w: { products: string[]; posts: string[] }, from: string | null) => {
    setError(null);
    if (!boards.length && !w.products.length && !w.posts.length) return setReport(null);
    const qs = new URLSearchParams({
      ...(boards.length ? { boards: boards.join(",") } : {}),
      ...(w.products.length ? { products: w.products.join(",") } : {}),
      ...(w.posts.length ? { posts: w.posts.join(",") } : {}),
      ...(from ? { since: from } : {}),
    });
    try {
      const res = await fetch(`/api/report?${qs}`);
      if (!res.ok) throw new Error(`리포트를 불러오지 못했어요 (${res.status})`);
      const r: Report = await res.json();
      setReport(r);
      // 병합된 제품은 새 번호로, 지워진 글은 목록에서 뺀다
      reconcile(
        r.watch.products.filter((p) => p.merged_into).map((p) => [p.id, p.merged_into!] as [string, string]),
        r.watch.gone,
      );
      // 관심 보드가 있는 리포트를 실제로 보여준 뒤에만 "확인함"으로 기록 → 다음 방문은 이 페이지를 연 시각 이후 새 글만.
      // (관심 보드를 고르기 전 온보딩 화면만 본 경우에는 기록하지 않아 첫 리포트가 최근 7일로 나온다)
      if (!marked.current) {
        marked.current = true;
        setSeenAt(openedAt.current);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (interests) void load(interests, watched, since);
  }, [interests, watched, since, load]);

  // 관심 보드는 브라우저에만 있어 서버가 미리 그릴 수 없다 — 자리를 넉넉히 잡아 두어 내용이 들어올 때 아래(푸터)가 밀려 올라오지 않게
  if (interests === null) return <div className="report-root" aria-busy="true"><p className="hint">불러오는 중…</p></div>;

  const picker = (
    <div className="field">
      <div className="chips" role="group" aria-label="관심 보드 선택">
        {allBoards.map((b) => (
          <button
            key={b.slug}
            type="button"
            className="chip"
            aria-pressed={interests.includes(b.slug)}
            onClick={() => setInterests(interests.includes(b.slug) ? interests.filter((s) => s !== b.slug) : [...interests, b.slug])}
          >
            {b.name}
          </button>
        ))}
      </div>
      <p className="hint">관심 보드는 이 브라우저에만 저장되고 서버에는 기록되지 않아요. 기기마다 따로 설정됩니다.</p>
    </div>
  );

  const watching = watched.products.length + watched.posts.length > 0;
  if (!interests.length && !watching) {
    return (
      <div className="report-root">
        <section className="card">
          <h2 className="card-title">관심 보드를 골라주세요</h2>
          <p className="hint" style={{ marginTop: 0 }}>고른 보드의 새 글과 주간 요약을 여기에 모아 드려요.</p>
          {picker}
          <p className="hint">
            제품 페이지의 <b>☆ 관심 제품</b>, 글의 <b>🔕 이 글 소식 받기</b>로 제품 새 글·댓글·정정 제안도 모을 수 있어요. 내가 쓴 글과 댓글·정정 제안을 단 글은 자동으로
            모입니다.
          </p>
        </section>
        {/* 늦게 나타나는 것(푸시 설정은 서버 응답 뒤)을 맨 아래에 — 위의 내용을 밀지 않게 */}
        <InstallPrompt />
        <PushSettings />
      </div>
    );
  }

  return (
    <div className="report-root" aria-busy={!report && !error}>
      <div className="report-head">
        <p className="hint" style={{ margin: 0 }}>
          {since ? `${fmtDate(since)} 이후` : "최근 7일"} · 관심 보드 {interests.length}개
          {watched.products.length > 0 && ` · 관심 제품 ${watched.products.length}개`}
          {watched.posts.length > 0 && ` · 지켜보는 글 ${watched.posts.length}개`}
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {since && (
            <button type="button" className="btn btn-sm" onClick={() => setSince(null)}>
              최근 7일 전체
            </button>
          )}
          <button type="button" className="btn btn-sm" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            보드 편집
          </button>
        </div>
      </div>
      {editing && picker}
      {error && <p className="error">{error}</p>}

      {report && watched.products.length > 0 && (
        <WatchedProducts items={report.watch.products} onRemove={(id) => toggleWatchProduct(id)} />
      )}
      {report && watched.posts.length > 0 && <WatchedPosts items={report.watch.posts} onRemove={(id) => toggleWatchPost(id)} />}

      {report && report.digests.length > 0 && (
        <section aria-label="이번 주 요약">
          <h2 className="section-title">🗞 이번 주 요약</h2>
          {report.digests.map((d) => (
            <article key={d.category_slug} className="ai-card">
              <h2>
                <Link href={`/c/${encodeURIComponent(d.category_slug)}`}>{d.category_name}</Link>
                <span>{d.model_version.startsWith("extractive") ? "인기 글 모음" : "AI 요약"} · {fmtDate(d.created_at)}</span>
              </h2>
              <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{d.headline}</p>
              <ol className="summary-lines">
                {d.lines.map((l, i) => (
                  <li key={i} data-n={i + 1}>
                    {d.post_ids[i] ? <Link href={`/posts/${d.post_ids[i]}`}>{l}</Link> : l}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </section>
      )}

      {report && report.meetups.length > 0 && (
        <section aria-label="다가오는 정모">
          <h2 className="section-title">📅 다가오는 정모</h2>
          <ul className="meetup-list">
            {report.meetups.map((m) => (
              <li key={m.id}>
                <Link href={`/posts/${m.id}`}>{m.title}</Link>
                <span className="hint" suppressHydrationWarning>
                  {" "}
                  · {m.category.name} · {formatMeetAt(m.meetup!.meet_at)} · {m.meetup!.rsvp_count}/{m.meetup!.capacity}명
                  {m.meetup!.status === "confirmed" ? " · 확정" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {interests.length > 0 && (
      <section aria-label="새 글">
        <h2 className="section-title">🆕 관심 보드 새 글 {report ? report.total : ""}</h2>
        {report && report.boards.length > 1 && (
          <p className="hint" style={{ marginTop: -4 }}>
            {report.boards.map((b) => `${b.name} ${b.newCount}`).join(" · ")}
          </p>
        )}
        {report && report.posts.length === 0 && <div className="empty">새 글이 없어요. 모두 확인했습니다 👏</div>}
        {report?.posts.map((p) => <PostCard key={p.id} post={p} />)}
        {report && report.total > report.posts.length && (
          <p className="hint">신뢰도 상위 {report.posts.length}개만 보여드려요. 나머지는 각 보드에서 확인하세요.</p>
        )}
      </section>
      )}

      {/* 리포트가 온 뒤에 — 새 글이 들어오며 설정 칸을 밀어내지 않게 */}
      {(report || error) && (
        <>
          <InstallPrompt />
          <PushSettings />
        </>
      )}

      {interests.length > 0 && (
      <p className="hint">
        RSS 리더로도 구독할 수 있어요:{" "}
        {report?.boards.map((b, i) => (
          <span key={b.slug}>
            {i > 0 && " · "}
            <a href={`/c/${encodeURIComponent(b.slug)}/feed.xml`}>{b.name}</a>
          </span>
        ))}
      </p>
      )}
    </div>
  );
}
