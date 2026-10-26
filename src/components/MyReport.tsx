"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMeetAt } from "@/components/Meetup";
import { PostCard } from "@/components/PostCard";
import { getInterests, getSeenAt, onInterestsChange, setInterests, setSeenAt } from "@/lib/interests";
import { getMyRooms, onMyRoomsChange, toggleMyRoom } from "@/lib/myRooms";
import { readReportInput } from "@/lib/reportClient";
import { reportBoards, reportQuery, type ReportMode } from "@/lib/reportQuery";
import { scheduleRoomAlertsSync } from "@/lib/roomAlerts";
import type { Report } from "@/lib/repo/report";
import { getMyComments, getWatchedPosts, getWatchedProducts, reconcile, removeMyComment, toggleWatchPost, toggleWatchProduct } from "@/lib/watchlist";
import { InstallPrompt } from "./InstallPrompt";
import { PushSettings } from "./PushSettings";
import { MyReplies, WatchedPosts, WatchedProducts } from "./WatchUpdates";

type Board = { slug: string; name: string };
type WatchLists = { products: string[]; posts: string[]; comments: string[] };
const readWatch = (): WatchLists => ({ products: getWatchedProducts(), posts: getWatchedPosts(), comments: getMyComments() });
const sameWatch = (a: WatchLists, b: WatchLists) =>
  a.products.join(",") === b.products.join(",") && a.posts.join(",") === b.posts.join(",") && a.comments.join(",") === b.comments.join(",");

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 리포트의 관심 방: 내 방이 있으면 내 방, 없으면 ☆ 관심 방 (배지와 같은 규칙, src/lib/reportQuery.ts) */
const readBoards = () => reportBoards(getMyRooms(), getInterests());

/**
 * 내 리포트: 관심 방의 지난 확인 이후 새 글·다가오는 정모·주간 다이제스트.
 * 관심 방과 확인 시각은 브라우저에만 저장되며, 리포트를 연 시각이 다음 번의 기준 시각이 된다.
 * 확인 시각은 새 글 목록을 실제로 그린 뒤에만 넘긴다 (10/25: 목록이 오기 전에 넘겨서 "새 소식 4개"를 한 번도 못 본 일).
 */
export function MyReport({ allBoards }: { allBoards: Board[] }) {
  const [interests, setLocal] = useState<string[] | null>(null);
  const [watched, setWatched] = useState<WatchLists>({ products: [], posts: [], comments: [] });
  const [since, setSince] = useState<string | null>(null);
  const [mode, setMode] = useState<ReportMode>("new");
  const [report, setReport] = useState<(Report & { mode: ReportMode }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const openedAt = useRef(new Date().toISOString());
  const marked = useRef(false);

  useEffect(() => {
    setSince(getSeenAt());
    setLocal(readBoards());
    setWatched(readWatch());
    // 내용이 같은 변경 알림(확인 시각 저장 등)으로는 다시 불러오지 않는다
    const sync = () => {
      const next = readBoards();
      setLocal((cur) => (cur && cur.join(",") === next.join(",") ? cur : next));
      const w = readWatch();
      setWatched((cur) => (sameWatch(cur, w) ? cur : w));
    };
    const off = onInterestsChange(sync);
    const offMine = onMyRoomsChange(sync);
    return () => {
      off();
      offMine();
    };
  }, []);

  const load = useCallback(async (boards: string[], w: WatchLists, from: string | null, m: ReportMode) => {
    setError(null);
    if (!boards.length && !w.products.length && !w.posts.length && !w.comments.length) return setReport(null);
    // 배지와 같은 요청 (기준 시각만 이 페이지를 연 때의 값으로 고정)
    const qs = reportQuery({ ...readReportInput(), since: from }, m);
    try {
      const res = await fetch(`/api/report?${qs}`);
      if (!res.ok) throw new Error(`리포트를 불러오지 못했어요 (${res.status})`);
      const r: Report = await res.json();
      setReport({ ...r, mode: m });
      // 병합된 제품은 새 번호로, 지워진 글은 목록에서 뺀다
      reconcile(
        r.watch.products.filter((p) => p.merged_into).map((p) => [p.id, p.merged_into!] as [string, string]),
        r.watch.gone,
        r.watch.gone_comments,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (interests) void load(interests, watched, since, mode);
  }, [interests, watched, since, mode, load]);

  // "새 글" 목록이 화면에 그려진 뒤에만 "확인함"으로 기록 → 다음 방문은 이 페이지를 연 시각 이후 새 글만.
  // (최근 7일 화면이나 관심 방을 고르기 전 온보딩 화면만 본 경우에는 기록하지 않는다)
  useEffect(() => {
    if (!report || report.mode !== "new" || marked.current) return;
    marked.current = true;
    setSeenAt(openedAt.current);
  }, [report]);

  const toggleBoard = (slug: string) => {
    const on = !interests?.includes(slug);
    // 내 방이 있으면 내 방이 곧 관심 방 — 둘을 같이 바꾼다 (☆ 버튼과 같은 동작)
    if (getMyRooms().length && toggleMyRoom(slug) === "full") return;
    const cur = getInterests();
    setInterests(on ? [...cur, slug] : cur.filter((s) => s !== slug));
    scheduleRoomAlertsSync();
  };

  // 관심 방은 브라우저에만 있어 서버가 미리 그릴 수 없다 — 자리를 넉넉히 잡아 두어 내용이 들어올 때 아래(푸터)가 밀려 올라오지 않게
  if (interests === null) return <div className="report-root" aria-busy="true"><p className="hint">불러오는 중…</p></div>;

  const picker = (
    <div className="field">
      <div className="chips" role="group" aria-label="관심 방 선택">
        {allBoards.map((b) => (
          <button
            key={b.slug}
            type="button"
            className="chip"
            aria-pressed={interests.includes(b.slug)}
            onClick={() => toggleBoard(b.slug)}
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );

  const watching = watched.products.length + watched.posts.length + watched.comments.length > 0;
  if (!interests.length && !watching) {
    return (
      <div className="report-root">
        <section className="card">
          <h2 className="card-title">관심 방을 골라주세요</h2>
          {picker}
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
          {mode === "week" ? "최근 7일 전체" : since ? `${fmtDate(since)} 이후` : "최근 7일"} · 관심 방 {interests.length}개
          {watched.products.length > 0 && ` · 관심 제품 ${watched.products.length}개`}
          {watched.posts.length > 0 && ` · 지켜보는 글 ${watched.posts.length}개`}
          {watched.comments.length > 0 && ` · 내 댓글 ${watched.comments.length}개`}
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-sm" aria-pressed={mode === "week"} onClick={() => setMode((m) => (m === "week" ? "new" : "week"))}>
            {mode === "week" ? "새 글만" : "최근 7일 전체"}
          </button>
          <button type="button" className="btn btn-sm" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            방 편집
          </button>
        </div>
      </div>
      {editing && picker}
      {error && <p className="error">{error}</p>}

      {report && report.watch.like_count > 0 && <p className="report-likes">👍 내 댓글에 공감 {report.watch.like_count}개</p>}
      {report && report.watch.liked_by.length > 0 && <p className="report-likes">👍 {report.watch.liked_by.join("·")}님이 내 댓글에 공감했어요</p>}
      {report && watched.comments.length > 0 && (
        <MyReplies items={report.watch.replies} count={report.watch.reply_count} onMute={(id) => removeMyComment(id)} />
      )}
      {report && watched.products.length > 0 && (
        <WatchedProducts items={report.watch.products} onRemove={(id) => toggleWatchProduct(id)} />
      )}
      {report && watched.posts.length > 0 && <WatchedPosts items={report.watch.posts} onRemove={(id) => toggleWatchPost(id)} />}

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
        <h2 className="section-title">
          {mode === "week" ? "🗓 관심 방 최근 7일" : "🆕 관심 방 새 글"} {report?.mode === mode ? report.total : ""}
        </h2>
        {report && report.boards.length > 1 && (
          <p className="hint" style={{ marginTop: -4 }}>
            {report.boards.map((b) => `${b.name} ${b.newCount}`).join(" · ")}
          </p>
        )}
        {report && report.posts.length === 0 && (
          <div className="empty">{report.mode === "week" ? "최근 7일 동안 올라온 글이 없어요." : "새 글이 없어요. 모두 확인했습니다 👏"}</div>
        )}
        {report?.posts.map((p) => <PostCard key={p.id} post={p} />)}
        {report && report.total > report.posts.length && (
          <p className="hint">상위 {report.posts.length}개만 보여요.</p>
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

    </div>
  );
}
