import type { Metadata } from "next";
import Link from "next/link";
import { compact, DailyBars, HBarList, StatTile, StatusPill } from "@/components/admin/charts";
import { config } from "@/lib/config";
import { kstDay } from "@/lib/metrics";
import * as m from "@/lib/repo/metrics";
import { LegalHoldPanel } from "@/components/admin/LegalHoldPanel";
import { activeLegalHolds, LEGAL_REASONS } from "@/lib/repo/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "운영 대시보드", robots: { index: false, follow: false } };

const SOURCE_LABEL: Record<string, string> = {
  search: "검색엔진",
  social: "SNS·메신저",
  referral: "다른 사이트",
  direct: "직접 방문",
  internal: "사이트 내부",
};

const ALERT_LABEL: Record<string, string> = {
  report_burst: "신고 집중",
  vote_burst: "투표 집중",
  board_vote_burst: "보드 투표 집중",
  mass_reporter: "대량 신고자",
};

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function sum<T>(rows: T[], f: (r: T) => number) {
  return rows.reduce((s, r) => s + f(r), 0);
}

function fmtTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function alertSubject(a: m.AlertRow) {
  if (a.subject_type === "post") return <Link href={`/posts/${a.subject_id}`}>글 #{a.subject_id} {typeof a.detail.title === "string" ? `· ${a.detail.title}` : ""}</Link>;
  if (a.subject_type === "board_request") return <Link href="/boards">보드 요청 #{a.subject_id} {typeof a.detail.name === "string" ? `· ${a.detail.name}` : ""}</Link>;
  return <code>{a.subject_id}…</code>;
}

function alertSummary(a: m.AlertRow) {
  const d = a.detail as Record<string, number | string | boolean | null>;
  switch (a.kind) {
    case "report_burst":
      return `15분 내 신고 ${d.reports}건 중 ${d.fromNewFingerprints}건이 갓 생긴 fingerprint${d.blinded ? " · 블라인드됨" : ""}`;
    case "vote_burst":
      return `15분 내 투표 ${d.votes}건 중 ${d.fromNewFingerprints}건이 갓 생긴 fingerprint (현재 ▲${d.upvotes} ▼${d.downvotes})`;
    case "board_vote_burst":
      return `15분 내 투표 ${d.votes}건 중 ${d.fromNewFingerprints}건이 갓 생긴 fingerprint · 상태 ${d.status}`;
    case "mass_reporter":
      return `최근 1시간 신고 ${d.reportsLastHour}건 · ${d.note}`;
    default:
      return JSON.stringify(d);
  }
}

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const requested = Number((await searchParams).range);
  const range: Range = (RANGES as readonly number[]).includes(requested) ? (requested as Range) : 7;
  const today = kstDay();
  const cur = [addDays(today, -(range - 1)), today] as const;
  const prev = [addDays(today, -(2 * range - 1)), addDays(today, -range)] as const;
  const periodLabel = `직전 ${range}일 대비`;

  const [daily, visCur, visPrev, sources, searchRefs, searchPosts, viewedPosts, internalSearches, boards, alerts, blinds, modCounts, jobs, boardReqs] =
    await Promise.all([
      m.dailySeries(Math.max(30, 2 * range)),
      m.periodVisitors(...cur),
      m.periodVisitors(...prev),
      m.sourceBreakdown(...cur),
      m.topReferrers(...cur, "search"),
      m.topSearchLandingPosts(...cur),
      m.topViewedPosts(...cur),
      m.topInternalSearches(...cur),
      m.boardStats(),
      m.recentAlerts(),
      m.recentBlinds(),
      m.moderationCounts(),
      m.jobHealth(),
      m.openBoardRequests(),
    ]);
  const holds = await activeLegalHolds();

  const last7 = daily.slice(-range);
  const prev7 = daily.slice(-2 * range, -range);
  const last14 = daily.slice(-2 * range);
  const chartDays = daily.slice(-Math.max(30, range));
  const revisit = visCur.visitors ? visCur.returning / visCur.visitors : 0;
  const revisitPrev = visPrev.visitors ? visPrev.returning / visPrev.visitors : 0;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const openAlerts = alerts.filter((a) => new Date(a.last_seen).getTime() > Date.now() - 24 * 3600_000);

  return (
    <div className="admin">
      <header className="admin-head">
        <h1>운영 대시보드</h1>
        <p className="hint">
          최근 {range}일({cur[0]} ~ {cur[1]}, KST) · 직전 {range}일과 비교 · 지표 우선순위: 검색 유입 → 조회 → 참여 → 재방문
        </p>
        <nav className="type-filter" aria-label="기간">
          {RANGES.map((r) => (
            <Link key={r} href={r === 7 ? "/admin" : `/admin?range=${r}`} aria-current={r === range ? "true" : undefined}>
              {r}일
            </Link>
          ))}
        </nav>
      </header>

      <section className="stat-row" aria-label="핵심 지표">
        <StatTile label="검색 유입" value={sum(last7, (r) => r.search_landings)} previous={sum(prev7, (r) => r.search_landings)} periodLabel={periodLabel} currentPoints={range} trend={last14.map((r) => r.search_landings)} hint="검색엔진에서 들어온 첫 페이지 수" />
        <StatTile label="페이지뷰" value={sum(last7, (r) => r.page_views)} previous={sum(prev7, (r) => r.page_views)} periodLabel={periodLabel} currentPoints={range} trend={last14.map((r) => r.page_views)} />
        <StatTile label="방문자" value={visCur.visitors} previous={visPrev.visitors} periodLabel={periodLabel} currentPoints={range} trend={last14.map((r) => r.visitors)} hint="기간 내 고유 방문자(쿠키 기준)" />
        <StatTile label="재방문율" value={revisit} previous={revisitPrev} format={pct} periodLabel={periodLabel} currentPoints={range} trend={last14.map((r) => (r.visitors ? r.returning_visitors / r.visitors : 0))} hint="기간 방문자 중 이전 날짜에도 방문했던 비율" />
        <StatTile label="사람이 쓴 글" value={sum(last7, (r) => r.human_posts)} previous={sum(prev7, (r) => r.human_posts)} periodLabel={periodLabel} currentPoints={range} trend={last14.map((r) => r.human_posts)} />
        <StatTile label="댓글·투표 참여" value={sum(last7, (r) => r.comments + r.votes)} previous={sum(prev7, (r) => r.comments + r.votes)} periodLabel={periodLabel} currentPoints={range} trend={last14.map((r) => r.comments + r.votes)} hint="사람 댓글 + 추천/비추천 수" />
      </section>

      <section className="chart-grid" aria-label="일별 추이">
        <DailyBars title="검색 유입" unit="회" data={chartDays.map((r) => ({ day: r.day, value: r.search_landings }))} description="검색엔진에서 들어온 랜딩 페이지 수" />
        <DailyBars title="페이지뷰" unit="회" data={chartDays.map((r) => ({ day: r.day, value: r.page_views }))} />
        <DailyBars title="재방문자" unit="명" data={chartDays.map((r) => ({ day: r.day, value: r.returning_visitors }))} description="그날 방문자 중 이전 날짜에 처음 온 방문자" />
      </section>

      <section className="chart-grid two" aria-label="유입 경로">
        <HBarList title={`유입 경로 (최근 ${range}일 랜딩)`} unit="회" empty="아직 수집된 방문이 없습니다." rows={sources.map((s) => ({ label: SOURCE_LABEL[s.source] ?? s.source, value: s.landings }))} />
        <HBarList title="검색엔진별 유입" unit="회" empty="검색 유입이 아직 없습니다." rows={searchRefs.map((r) => ({ label: r.host, value: r.landings }))} />
      </section>

      <section className="panel-grid">
        <div className="panel">
          <h2>검색으로 들어오는 글</h2>
          <PostTable rows={searchPosts} unit="유입" empty="검색 유입 랜딩이 아직 없습니다." />
        </div>
        <div className="panel">
          <h2>많이 본 글</h2>
          <PostTable rows={viewedPosts} unit="조회" empty="조회 기록이 아직 없습니다." />
        </div>
        <div className="panel">
          <h2>사이트 내 검색어</h2>
          {internalSearches.length === 0 ? (
            <p className="hint">검색 기록이 없습니다.</p>
          ) : (
            <table className="data-table">
              <tbody>
                {internalSearches.map((s) => (
                  <tr key={s.q}>
                    <td>
                      <Link href={`/search?q=${encodeURIComponent(s.q)}`}>{s.q}</Link>
                    </td>
                    <td className="num">{s.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint">자주 검색되지만 글이 적은 주제는 AI 큐레이터 초안(curator:generate) 후보입니다.</p>
        </div>
      </section>

      <section className="panel">
        <h2>보드별 현황 (최근 7일)</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>보드</th>
                <th className="num">사람 글</th>
                <th className="num">AI 글</th>
                <th className="num">댓글</th>
                <th className="num">글 조회</th>
                <th>AI 큐레이터</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.slug}>
                  <td>
                    <Link href={`/c/${encodeURIComponent(b.slug)}`}>{b.name}</Link>
                    {b.auto_promoted && <span className="hint"> · 투표 개설</span>}
                  </td>
                  <td className="num">{b.human_posts_7d}</td>
                  <td className="num">{b.ai_posts_7d}</td>
                  <td className="num">{b.comments_7d}</td>
                  <td className="num">{compact(b.views_7d)}</td>
                  <td>
                    {b.curator_interval_hours === null ? "물러남(중단)" : `${b.curator_interval_hours}시간 간격`} · 대기 {b.queued}건
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>
          어뷰징 모니터링 <span className="hint">— 자동 처분 없이 기록만 합니다 (방장 없는 구조)</span>
        </h2>
        <div className="stat-row small">
          <StatTile label="최근 24시간 알림" value={openAlerts.length} />
          <StatTile label="7일 자동 블라인드" value={modCounts.blinded_7d} />
          <StatTile label="7일 신고" value={modCounts.reports_7d} />
          <StatTile label="가중치 하향된 신고" value={modCounts.downweighted_7d} hint="대량·집중 신고로 가중치가 1 미만이 된 신고" />
          <StatTile label="광고 의심 노출 하향" value={modCounts.suppressed} />
        </div>
        {alerts.length === 0 ? (
          <p className="hint">탐지된 패턴이 없습니다.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>유형</th>
                  <th>대상</th>
                  <th>내용</th>
                  <th>마지막 탐지</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <StatusPill status={a.severity} />
                    </td>
                    <td>{ALERT_LABEL[a.kind] ?? a.kind}</td>
                    <td>{alertSubject(a)}</td>
                    <td>{alertSummary(a)}</td>
                    <td>{fmtTime(a.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {blinds.length > 0 && (
          <>
            <h3>최근 7일 자동 블라인드</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>글</th>
                  <th className="num">신고자</th>
                  <th className="num">가중치 합</th>
                  <th>시각</th>
                </tr>
              </thead>
              <tbody>
                {blinds.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/posts/${b.id}`}>{b.title}</Link> <span className="hint">· {b.category}</span>
                    </td>
                    <td className="num">{b.report_count}</td>
                    <td className="num">{b.report_score.toFixed(1)}</td>
                    <td>{fmtTime(b.blinded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="panel">
        <h2>
          법적 임시조치 <span className="hint">— 정보통신망법 제44조의2 권리침해 신고 대응 전용. 모든 조치는 /transparency 에 공개됩니다</span>
        </h2>
        <div className="panel-grid">
          <LegalHoldPanel />
          <div>
            {holds.length === 0 ? (
              <p className="hint">임시조치 중인 글이 없습니다.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>글</th>
                    <th>사유</th>
                    <th>만료</th>
                  </tr>
                </thead>
                <tbody>
                  {holds.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <Link href={`/posts/${h.id}`}>#{h.id}</Link> {h.title}
                      </td>
                      <td>{LEGAL_REASONS[h.reason]}</td>
                      <td>
                        {h.overdue ? <StatusPill status="warning" /> : null} {fmtTime(h.until)}
                        {h.overdue && <div className="hint">30일 경과 — 해제 또는 후속 조치 필요</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <section className="panel-grid">
        <div className="panel">
          <h2>보드 개설 요청</h2>
          <p className="hint">
            찬성 {config.boardPromotionThreshold}표 + 요청 후 {config.boardPromotionMinAgeHours}시간이 지나면 자동 개설
          </p>
          {boardReqs.length === 0 ? (
            <p className="hint">진행 중인 요청이 없습니다.</p>
          ) : (
            <table className="data-table">
              <tbody>
                {boardReqs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.requested_name}</td>
                    <td className="num">
                      {r.vote_count}/{config.boardPromotionThreshold}
                    </td>
                    <td className="hint">{fmtTime(r.promotable_at)} 이후</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <h2>배치 상태</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>작업</th>
                <th>상태</th>
                <th>마지막 실행</th>
              </tr>
            </thead>
            <tbody>
              {(["trust", "curator", "maintenance"] as const).map((job) => {
                const j = jobs.find((x) => x.job === job);
                const status = !j ? "warning" : j.error ? "critical" : Date.now() - new Date(j.started_at!).getTime() > 3 * 3600_000 ? "warning" : "good";
                return (
                  <tr key={job} title={j?.error ?? undefined}>
                    <td>{{ trust: "신뢰도 배지", curator: "AI 큐레이터", maintenance: "어뷰징 탐지·정리" }[job]}</td>
                    <td>
                      <StatusPill status={status} />
                    </td>
                    <td>{j ? fmtTime(j.started_at) : "실행 기록 없음"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PostTable({ rows, unit, empty }: { rows: m.TopPost[]; unit: string; empty: string }) {
  if (rows.length === 0) return <p className="hint">{empty}</p>;
  return (
    <table className="data-table">
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <td>
              <Link href={`/posts/${p.id}`}>{p.title}</Link>
              <span className="hint">
                {" "}
                · {p.category}
                {p.is_ai_curated ? " · 🤖" : ""}
              </span>
            </td>
            <td className="num">
              {p.n.toLocaleString("ko-KR")} {unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
