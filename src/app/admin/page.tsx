import { quickReplyStats } from "@/lib/repo/quickReply";
import { quizRetention } from "@/lib/repo/quizRetention";
import { gameStats } from "@/lib/repo/miniGames";
import { quizStats, streakDistribution } from "@/lib/repo/roomQuizzes";
import { listAutoHidden, listDuplicates, operatorReports, REPORT_TYPE_LABEL } from "@/lib/repo/reports";
import { AdminHideButton } from "@/components/AdminHideButton";
import { HIDE_TYPES } from "@/lib/repo/opHide";
import type { Metadata } from "next";
import { ResolveError } from "@/components/admin/ResolveError";
import Link from "next/link";
import { goingStats, listPenaltyAppeals, listPlaceReports } from "@/lib/repo/eventGoing";
import { compact, DailyBars, HBarList, StatTile, StatusPill } from "@/components/admin/charts";
import { config } from "@/lib/config";
import { getRules, listProposals } from "@/lib/repo/rules";
import { formatRule, RULES } from "@/lib/rules";
import { HideRuleReason } from "@/components/admin/HideRuleReason";
import { kstDay } from "@/lib/metrics";
import * as m from "@/lib/repo/metrics";
import type { UserStateDay } from "@/lib/repo/metrics";
import { LegalHoldPanel } from "@/components/admin/LegalHoldPanel";
import { activeLegalHolds, LEGAL_REASONS } from "@/lib/repo/legal";
import { pendingCounts } from "@/lib/repo/operator";
import { countNew as countNewFeedback } from "@/lib/repo/feedback";
import { pendingDraftCount } from "@/lib/repo/drafts";
import { getBoardThreshold } from "@/lib/repo/board-requests";
import { getBusinessMetrics } from "@/lib/repo/business";
import { earFunnel } from "@/lib/repo/earTest";
import { dailyPlayers } from "@/lib/repo/daily";
import { pushStats } from "@/lib/repo/push";
import { calendarFetchStats } from "@/lib/repo/roomCalendar";
import { ownerAlertDevices } from "@/lib/repo/ownerAlert";
import { OwnerAlertCard } from "@/components/admin/OwnerAlertCard";
import { firstLineFunnel } from "@/lib/repo/firstLineTest";
import { typingFunnel } from "@/lib/repo/typingTest";
import { aiFunnel } from "@/lib/repo/aiTest";
import { hearingFunnel } from "@/lib/repo/hearingTest";
import { SignalStrip } from "@/components/admin/SignalStrip";
import { ALERT_LABEL, alertSubject, alertSummary } from "@/components/admin/alert-text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "운영 대시보드", robots: { index: false, follow: false } };

const SOURCE_LABEL: Record<string, string> = {
  search: "검색엔진",
  social: "SNS·메신저",
  referral: "다른 사이트",
  direct: "직접 방문",
  internal: "사이트 내부",
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

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const requested = Number((await searchParams).range);
  const range: Range = (RANGES as readonly number[]).includes(requested) ? (requested as Range) : 7;
  const today = kstDay();
  const cur = [addDays(today, -(range - 1)), today] as const;
  const prev = [addDays(today, -(2 * range - 1)), addDays(today, -range)] as const;
  const periodLabel = `직전 ${range}일 대비`;

  const [daily, visCur, visPrev, sources, searchRefs, socialRefs, searchPosts, viewedPosts, internalSearches, boards, alerts, blinds, modCounts, jobs, boardReqs, errors] =
    await Promise.all([
      m.dailySeries(Math.max(30, 2 * range)),
      m.periodVisitors(...cur),
      m.periodVisitors(...prev),
      m.sourceBreakdown(...cur),
      m.topReferrers(...cur, "search"),
      m.topReferrers(...cur, "social"),
      m.topSearchLandingPosts(...cur),
      m.topViewedPosts(...cur),
      m.topInternalSearches(...cur),
      m.boardStats(),
      m.recentAlerts(),
      m.recentBlinds(),
      m.moderationCounts(),
      m.jobHealth(),
      m.openBoardRequests(),
      m.openErrors(),
    ]);
  const campaigns = await m.campaignStats(...cur).catch(() => []);
  const monthStart = `${today.slice(0, 8)}01`;
  const quick = await quickReplyStats().catch(() => null);
  const quizRows = await quizStats(7).catch(() => []);
  const retention = await quizRetention(7).catch(() => null);
  const games = await gameStats(7).catch(() => null);
  const streaks = await streakDistribution(today).catch(() => null);
  const [ear, hearing, firstLine, typing, aiT, month, daily7, states, people, readers, readers7, readers28] = await Promise.all([
    earFunnel(...cur),
    hearingFunnel(...cur),
    firstLineFunnel(...cur),
    typingFunnel(...cur),
    aiFunnel(...cur),
    m.periodVisitors(monthStart, today),
    dailyPlayers(...cur),
    m.userStates(today),
    m.peopleReactions(today),
    m.readerDaily(today),
    m.readerPeriod(today, 7),
    m.readerPeriod(today, 28),
  ]);
  const [goingS, goingAppeals, goingPlaces] = await Promise.all([
    goingStats(...cur).catch(() => null),
    listPenaltyAppeals().catch(() => []),
    listPlaceReports().catch(() => []),
  ]);
  const [holds, pending, rules, ruleVotes, feedback, boardT, biz, drafts, ownerDevices] = await Promise.all([
    activeLegalHolds(),
    pendingCounts(),
    getRules(),
    listProposals({ status: "open" }),
    countNewFeedback(),
    getBoardThreshold(),
    getBusinessMetrics().catch((e) => {
      console.error("[business] 지표 계산 실패:", (e as Error).message);
      return null;
    }),
    pendingDraftCount().catch(() => 0),
    ownerAlertDevices().catch(() => 0),
  ]);

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
        <p>
          <Link className="btn btn-sm" href="/admin/moderation">
            🛡 모더레이션{pending.appeals + pending.alerts > 0 ? ` · 재검토 요청 ${pending.appeals} · 열린 알림 ${pending.alerts}` : ""}
          </Link>{" "}
          <Link className="btn btn-sm" href="/admin/drafts">
            📝 승인 대기함{drafts > 0 ? ` · ${drafts}` : ""}
          </Link>{" "}
          <Link className="btn btn-sm" href="/admin/feedback">
            🛠 제보{feedback.new + feedback.open > 0 ? ` · 새 제보 ${feedback.new} · 처리 중 ${feedback.open}` : ""}
          </Link>{" "}
          <Link className="btn btn-sm" href="/admin/event-groups">
            🙋 동행{goingAppeals.length + goingPlaces.length > 0 ? ` · 이의제기 ${goingAppeals.length} · 장소 신고 ${goingPlaces.length}` : ""}
          </Link>
        </p>
        <nav className="type-filter" aria-label="기간">
          {RANGES.map((r) => (
            <Link key={r} href={r === 7 ? "/admin" : `/admin?range=${r}`} aria-current={r === range ? "true" : undefined}>
              {r}일
            </Link>
          ))}
        </nav>
      </header>

      <OwnerAlertCard devices={ownerDevices} />

      <MonthGoal today={today} visitors={month.visitors} returning={month.returning} daily={daily7} range={range} />
      <PeopleReactions rows={people} quick={quick} />
      <UserStates rows={states} />
      <ReaderRatio rows={readers} w={readers7} m28={readers28} />

      {biz && <SignalStrip m={biz} />}

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

      <section aria-label="오늘의 1분 퀴즈">
        <h2 className="section-title">🧩 오늘의 1분 퀴즈 응답률 (최근 7일)</h2>
        <p className="hint">
          방문자: 그날 방 첫 화면을 연 사람 · 본 사람: 퀴즈 카드가 화면에 보인 사람 · 답: 퀴즈 답 + 기존 오늘의 질문 투표 · 🙌 버튼 답장: 한 번 누르는 답장 수
        </p>
        {streaks && (
          <p className="hint">
            🔥 지금 이어지는 연속 참여: 1~2일 {streaks.d1_2}명 · 3~6일 {streaks.d3_6}명 · 7~29일 {streaks.d7_29}명 · 30일+ {streaks.d30}명
          </p>
        )}
        {quizRows.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>방</th>
                <th>방문자</th>
                <th>본 사람</th>
                <th>답</th>
                <th>답/방문자</th>
                <th>답/본 사람</th>
                <th>🙌 버튼 답장</th>
              </tr>
            </thead>
            <tbody>
              {quizRows.slice(0, 80).map((r) => (
                <tr key={`${r.day}-${r.room}`}>
                  <td>{r.day.slice(5)}</td>
                  <td>{r.room}</td>
                  <td>{r.visitors}</td>
                  <td>{r.impressions}</td>
                  <td>{r.answers + r.pollVotes}</td>
                  <td>{r.rateVisitors}%</td>
                  <td>{r.impressions ? `${r.rateSeen}%` : "-"}</td>
                  <td>{r.chips}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">아직 기록이 없습니다.</p>
        )}
      </section>

      <section aria-label="퀴즈 리텐션">
        <h2 className="section-title">📊 퀴즈 리텐션 (최근 7일{retention ? ` · ${retention.from.slice(5)}~${retention.to.slice(5)}` : ""})</h2>
        <p className="hint">
          참여율: 방문자 중 답한 사람 · 다음 날 재방문: 그날 답한 사람 중 다음 날 같은 방에 다시 온 비율 (오늘 답한 사람은 내일 나와서 -) · 3일 이상: 7일 동안 답한 사람 중 3일 이상 답한 비율 · 답: 퀴즈 + 오늘의 질문 투표 + 코스피 맞히기 · <span className="count-badge">테스트</span> 나중에 🏆 이번 주 순위를 먼저 켤 방
        </p>
        {retention && retention.rooms.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>방</th>
                  <th>답한 사람</th>
                  <th>다음 날 재방문</th>
                  <th>3일 이상</th>
                  <th>날짜별 참여율 · 다음 날 재방문</th>
                </tr>
              </thead>
              <tbody>
                {[retention.total, ...retention.rooms].slice(0, 41).map((r) => (
                  <tr key={r.room}>
                    <td>
                      {r.room === "전체" ? <strong>전체</strong> : r.room} {r.test && <span className="count-badge">테스트</span>}
                    </td>
                    <td>{r.answerers}</td>
                    <td>{r.nextDay === null ? "-" : `${r.nextDay}%`}</td>
                    <td>
                      {r.regularRate}% ({r.regulars})
                    </td>
                    <td>{r.days.map((x) => `${x.day.slice(5)} ${x.rate}%·${x.nextDay === null ? "-" : `${x.nextDay}%`}`).join("  ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">아직 기록이 없습니다.</p>
        )}
      </section>

      <section aria-label="미니게임">
        <h2 className="section-title">🎮 미니게임 (최근 7일)</h2>
        <p className="hint">버튼: 방 버튼으로 들어온 수 · 판: 끝까지 한 판 수 · 사람: 한 사람 수 · 2일 이상: 7일 동안 이틀 이상 한 사람</p>
        {games ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>게임</th>
                  <th>사람</th>
                  <th>2일 이상</th>
                  <th>날짜별 버튼 · 판 · 사람</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.game}>
                    <td>{g.name}</td>
                    <td>{g.players}</td>
                    <td>{g.returning}</td>
                    <td>{g.days.filter((d) => d.opens || d.plays).map((d) => `${d.day.slice(5)} ${d.clicks}·${d.plays}·${d.players}`).join("  ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">아직 기록이 없습니다.</p>
        )}
      </section>

      <section aria-label="광고별 유입">
        <h2 className="section-title">📣 광고별 유입 (최근 {range}일)</h2>
        <p className="hint">광고 링크의 utm_campaign(또는 from=ig_ad&amp;c=…)으로 처음 들어온 사람. 10/28 배포 뒤부터 쌓여요.</p>
        {campaigns.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>광고</th>
                <th>첫 유입</th>
                <th>들어온 횟수</th>
                <th>사람</th>
                <th>다른 날 다시 옴</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.campaign}>
                  <td>{c.campaign}</td>
                  <td>{c.first_day}</td>
                  <td>{c.landings.toLocaleString("ko-KR")}</td>
                  <td>{c.visitors.toLocaleString("ko-KR")}</td>
                  <td>
                    {c.returned.toLocaleString("ko-KR")}명{c.visitors ? ` (${Math.round((c.returned / c.visitors) * 100)}%)` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">아직 광고 표시가 붙은 유입이 없습니다.</p>
        )}
      </section>

      <section className="chart-grid two" aria-label="유입 경로">
        <HBarList title={`유입 경로 (최근 ${range}일 랜딩)`} unit="회" empty="아직 수집된 방문이 없습니다." rows={sources.map((s) => ({ label: SOURCE_LABEL[s.source] ?? s.source, value: s.landings }))} />
        <HBarList title="검색엔진별 유입" unit="회" empty="검색 유입이 아직 없습니다." rows={searchRefs.map((r) => ({ label: r.host, value: r.landings }))} />
        <HBarList title="SNS별 유입" unit="회" empty="SNS 유입이 아직 없습니다." rows={socialRefs.map((r) => ({ label: r.host, value: r.landings }))} />
        <HBarList
          title={`🙋 같이 갈 사람 (최근 ${range}일, 남아 있는 것 기준)`}
          unit=""
          empty="아직 없습니다."
          rows={goingS && goingS.toggles + goingS.groups + goingS.joins + goingS.pool > 0 ? [
            { label: "갈 거예요 (명)", value: goingS.toggles },
            { label: "같이 가요 모집 열림 (개)", value: goingS.groups },
            { label: "모집 참여 (명)", value: goingS.joins },
            { label: "조 짜 주세요 신청 (명)", value: goingS.pool },
            { label: "자동 조 편성 (개)", value: goingS.auto },
          ] : []}
        />
        {[
          { name: "황금귀 테스트", f: ear },
          { name: "고음 청력 테스트", f: hearing },
          { name: "첫 문장 테스트", f: firstLine },
          { name: "타자 테스트", f: typing },
          { name: "AI 판별 테스트", f: aiT },
        ].map(({ name, f }) => (
          <HBarList
            key={name}
            title={`${name} → 커뮤니티 (최근 ${range}일)`}
            unit=""
            funnel
            empty="테스트를 끝낸 사람이 아직 없습니다."
            rows={f.finished ? [
              { label: "테스트 완료 (첫 응시, 명)", value: f.finished },
              { label: "인증 버튼 누름 (명)", value: f.bragClicks },
              { label: "인증 글 댓글 (건)", value: f.bragComments },
            ] : []}
          />
        ))}
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
        <h2>방별 현황 (최근 7일)</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>방</th>
                <th className="num" title="AI 큐레이터가 물러나는 기준 — 사람이 쓴 정보 글">사람 정보글</th>
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

      <ReportsPanel />
      <AutoHiddenPanel />
      <DuplicatesPanel />

      <section className="panel">
        <h2>
          어뷰징 모니터링 <span className="hint">— 탐지는 자동, 처분은 없음. 조작이 확인되면 <Link href="/admin/moderation">모더레이션</Link>에서 무효화(공개 기록)</span>
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
          <h2>방 개설 요청</h2>
          <p className="hint">
            동의 {boardT.needed}명 (최근 30일 활동 {boardT.active30d.toLocaleString("ko-KR")}명의 5%, 최소 3·최대 {boardT.cap}) + 요청 후{" "}
            {config.boardPromotionMinAgeHours}시간이 지나면 자동 개설
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
                      {r.vote_count}/{boardT.needed}
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
              {(["trust", "curator", "maintenance", "sources", "push"] as const).map((job) => {
                const j = jobs.find((x) => x.job === job);
                const status = !j ? "warning" : j.error ? "critical" : Date.now() - new Date(j.started_at!).getTime() > 3 * 3600_000 ? "warning" : "good";
                return (
                  <tr key={job} title={j?.error ?? undefined}>
                    <td>
                      {{ trust: "신뢰도 배지", curator: "AI 큐레이터", maintenance: "어뷰징 탐지·정리", sources: "출처 링크 확인", push: "푸시 알림" }[job]}
                      {job === "sources" && j?.detail ? <span className="hint"> · 확인/새로 깨짐 {j.detail}</span> : null}
                      {job === "push" && j?.detail ? <span className="hint"> · 발송/확인 {j.detail}</span> : null}
                    </td>
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

      <section className="panel" aria-labelledby="rulevotes-h">
        <h2 id="rulevotes-h">커뮤니티 규칙 투표</h2>
        <p className="hint">운영자는 규칙 값을 바꿀 수 없습니다. 제안 이유에 권리침해가 있을 때만 이유를 가릴 수 있고, 공개 기록에 남습니다.</p>
        {ruleVotes.length === 0 ? (
          <p className="hint">진행 중인 투표가 없습니다.</p>
        ) : (
          <ul className="admin-list">
            {ruleVotes.map((p) => (
              <li key={p.id}>
                <a href={`/rules#proposal-${p.id}`}>
                  #{p.id} {RULES[p.rule_key].label} {formatRule(p.rule_key, p.from_value)} → {formatRule(p.rule_key, p.to_value)}
                </a>{" "}
                <span className="hint">
                  찬성 {p.yes_weight} / 반대 {p.no_weight} · 정족수 {p.quorum} · {p.voter_count}명
                </span>{" "}
                {!p.reason_hidden && <HideRuleReason id={p.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <PushPanel />
      <CalendarPanel />

      <section className="panel" aria-labelledby="errors-h">
        <h2 id="errors-h">
          서버 오류 {errors.length > 0 && <span className="count-badge">{errors.length}</span>}
        </h2>
        <p className="hint">
          같은 오류는 한 줄로 묶어 셉니다. 해결 표시한 오류가 다시 나면 자동으로 다시 열립니다.{" "}
          {config.alertWebhookUrl ? "새 오류·급증은 알림 웹훅으로 보냅니다." : "ALERT_WEBHOOK_URL 을 설정하면 새 오류·급증을 메신저로 받을 수 있습니다."}
        </p>
        {errors.length === 0 ? (
          <p className="hint">열린 오류가 없습니다.</p>
        ) : (
          <ul className="mod-list">
            {errors.map((e) => (
              <li key={e.id}>
                <div className="mod-row">
                  <b style={{ overflowWrap: "anywhere" }}>{e.message}</b>
                  <span className="hint">
                    {ERROR_KIND[e.kind]} · {e.count}회{e.hour_count > 0 ? ` (최근 1시간 ${e.hour_count})` : ""} · 마지막 {fmtTime(e.last_seen)}
                  </span>
                </div>
                {e.path && <p className="hint" style={{ margin: 0 }}>{e.path}</p>}
                {e.stack && (
                  <details>
                    <summary className="hint">스택</summary>
                    <pre className="stack">{e.stack}</pre>
                  </details>
                )}
                <ResolveError id={e.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const ERROR_KIND = { api: "API", page: "페이지", job: "배치", process: "프로세스", client: "브라우저" } as const;

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

/** 🤝 사람끼리 반응 (Sprint 87) — AI 는 사회자, 주인공은 사람. 북극성 지표 */
function PeopleReactions({ rows, quick }: { rows: m.PeopleDay[]; quick: { chips: number; welcomes: number; welcomers: number } | null }) {
  const [t, y] = rows;
  const week = rows.reduce((s, r) => s + r.h2h, 0);
  return (
    <section className="month-goal" aria-label="사람끼리 반응">
      <p>
        <b>🤝 사람끼리 반응 오늘 {t?.h2h ?? 0}</b>{" "}
        <span className="hint">
          · 어제 {y?.h2h ?? 0} · 7일 {week} · 오늘 사람 댓글 중 사람이 답한 비율 {t?.answered == null ? "—" : `${t.answered}%`}
        </span>
      </p>
      {quick && (
        <p className="hint">
          🙌 버튼 답장 7일 {quick.chips} · 🙌 첫 환영 7일 {quick.welcomes} (환영러 {quick.welcomers}명)
        </p>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>날짜</th>
            <th>사람 말</th>
            <th>사람↔사람</th>
            <th>사람 답 받음</th>
            <th>사람 👍</th>
            <th>🎉 축하</th>
            <th>💪 응원 탭</th>
            <th>운영·AI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <td>{r.day.slice(5)}</td>
              <td>{r.human}</td>
              <td>{r.h2h}</td>
              <td>{r.answered == null ? "—" : `${r.answered}%`}</td>
              <td>{r.likes}</td>
              <td>{r.cheers}</td>
              <td>{r.cheer_taps}</td>
              <td>{r.ops}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">사람↔사람: 사람 댓글에 단 답글 + 사람 글에 단 댓글 + 수다방에서 30분 안에 다른 사람 말에 이어 말한 것 + 사람 덕질 기념일 카드에 다른 사람이 누른 🎉 축하 · 운영 닉네임·AI 제외 · 💪 응원 탭(운영 응원 카드)은 따로 세고 더하지 않음</p>
    </section>
  );
}

/** 📖 읽는 사람 비율 — 방문자 중 글을 연 사람, 그중 참여한 사람 */
function ReaderRatio({ rows, w, m28 }: { rows: m.ReaderDay[]; w: m.ReaderDay; m28: m.ReaderDay }) {
  const pc = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  return (
    <section className="month-goal" aria-label="읽는 사람 비율">
      <p>
        <b>읽는 사람 비율</b>{" "}
        <span className="hint">
          · 7일: 방문 {w.visitors} · 글 읽음 {w.readers} ({pc(w.readers, w.visitors)}) · 참여 {w.contributors} ({pc(w.contributors, w.visitors)})
        </span>
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>날짜</th>
            <th>방문</th>
            <th>글 읽음</th>
            <th>%</th>
            <th>참여</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <td>{r.day.slice(5)}</td>
              <td>{r.visitors}</td>
              <td>{r.readers}</td>
              <td>{pc(r.readers, r.visitors)}</td>
              <td>{r.contributors}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        7일 보기만 {w.lurkers} · 바로 나감 {w.bounced} · 28일: 방문 {m28.visitors} · 글 읽음 {m28.readers} ({pc(m28.readers, m28.visitors)}) · 참여 {m28.contributors}
      </p>
    </section>
  );
}

/** 듀오링고식 사용자 상태 (Sprint 80). 메인 지표는 CURR — 어제 온 사람 중 오늘도 온 비율 */
function UserStates({ rows }: { rows: UserStateDay[] }) {
  const [t, y] = rows;
  return (
    <section className="month-goal" aria-label="사용자 상태">
      <p>
        <b>CURR (어제 온 사람 중 오늘도 온 비율) {t?.curr == null ? "—" : `${t.curr}%`}</b>{" "}
        <span className="hint">
          · 어제 {y?.curr == null ? "—" : `${y.curr}%`} · 오늘 위험 사용자 {t?.at_risk ?? 0}명 (어제 왔는데 오늘 아직 안 옴)
        </span>
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>날짜</th>
            <th>방문</th>
            <th>새</th>
            <th>현재</th>
            <th>돌아온</th>
            <th>위험</th>
            <th>CURR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <td>{r.day.slice(5)}</td>
              <td>{r.active}</td>
              <td>{r.new_users}</td>
              <td>{r.current}</td>
              <td>{r.reactivated}</td>
              <td>{r.at_risk}</td>
              <td>{r.curr == null ? "—" : `${r.curr}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">새: 그날 처음 온 사람 · 현재: 전날도 온 사람 · 돌아온: 쉬다가 다시 온 사람 · 위험: 전날 왔는데 그날 안 온 사람</p>
    </section>
  );
}

/** 이번 달 목표: 재방문자 (Sprint 66, 사용자 10/15 "이번 달 안에 천 명 — 한 번 왔다 가는 사람 말고 재방문자") */
const MONTH_RETURNING_GOAL = 1000;

function MonthGoal({ today, visitors, returning, daily, range }: { today: string; visitors: number; returning: number; daily: { players: number; repeat: number }; range: number }) {
  const [y, mo] = today.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const left = Math.max(1, lastDay - Number(today.slice(8)) + 1);
  const need = Math.max(0, MONTH_RETURNING_GOAL - returning);
  const pctDone = Math.min(100, (returning / MONTH_RETURNING_GOAL) * 100);
  return (
    <section className="month-goal" aria-label="이번 달 목표">
      <p>
        <b>
          {mo}월 재방문자 {returning.toLocaleString()} / {MONTH_RETURNING_GOAL.toLocaleString()}명
        </b>{" "}
        <span className="hint">
          · 이번 달 방문자 {visitors.toLocaleString()}명 중 다른 날 다시 온 사람 · 남은 {left}일 · 하루 {Math.ceil(need / left)}명 필요
        </span>
      </p>
      <div className="month-goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={MONTH_RETURNING_GOAL} aria-valuenow={returning}>
        <span style={{ width: `${pctDone}%` }} />
      </div>
      <p className="hint">
        📅 오늘의 문제 (최근 {range}일): 푼 사람 {daily.players}명 · 그중 2일 이상 {daily.repeat}명
      </p>
    </section>
  );
}

/** 📅 달력 구독 (10/26) — /cal/rooms.ics 를 가져간 횟수. 달력 앱은 몇 시간마다 다시 가져가므로 사람 수가 아니다 */
async function CalendarPanel() {
  const c = await calendarFetchStats().catch(() => null);
  return (
    <section className="panel" aria-labelledby="cal-h">
      <h2 id="cal-h">📅 달력 구독</h2>
      <p className="hint">방 행사 달력(/cal/rooms.ics)을 가져간 횟수예요. 구독한 달력 앱이 몇 시간마다 다시 가져가서 사람 수보다 많아요.</p>
      {c ? (
        <div className="stat-row small">
          <StatTile label="📅 달력 구독 (오늘)" value={c.today} />
          <StatTile label="최근 7일" value={c.week} />
          <StatTile label="최근 30일" value={c.month} />
        </div>
      ) : (
        <p className="hint">불러오지 못했어요.</p>
      )}
    </section>
  );
}

/** 🔔 알림 신청 현황 (10/22) — 웹 푸시 구독 수와 방별 🎫 행사 알림 */
async function PushPanel() {
  const p = await pushStats();
  return (
    <section className="panel" aria-labelledby="push-h">
      <h2 id="push-h">🔔 알림 신청 (웹 푸시)</h2>
      <p className="hint">카톡이 아니라 브라우저 푸시 알림이에요. 휴대폰은 홈 화면에 추가한 뒤 켤 수 있어요(iPhone).</p>
      <div className="stat-row small">
        <StatTile label="푸시 켠 기기" value={p.total} />
        <StatTile label="매일 알림" value={p.daily} />
        <StatTile label="🎫 행사 알림" value={p.eventSubs} />
      </div>
      <HBarList title="🎫 방별 행사 알림" rows={p.rooms.map((r) => ({ label: r.slug, value: r.n }))} unit="명" empty="아직 행사 알림을 켠 사람이 없어요." />
    </section>
  );
}

/** 🚩 신고 들어온 것 (10/29 대표님 "신고하면 가려지는게 아니라 나한테 보고"): 신고는 아무것도 가리지 않고 여기로 온다 */
async function ReportsPanel() {
  const items = await operatorReports(7, 50);
  return (
    <section className="panel" aria-labelledby="reports-h">
      <h2 id="reports-h">
        🚩 신고 들어온 것 {items.length > 0 && <span className="count-badge">{items.length}</span>}{" "}
        <span className="hint">— 최근 7일. 신고로는 가리지 않아요. 확인하고 운영자가 조치</span>
      </h2>
      {items.length === 0 ? (
        <p className="hint">최근 7일 신고가 없습니다.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>종류</th>
                <th>방</th>
                <th>내용</th>
                <th className="num">신고</th>
                <th>사유</th>
                <th>마지막</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={`${r.type}-${r.id}`}>
                  <td>
                    {r.priority && <b>⚠️ 우선 </b>}
                    {REPORT_TYPE_LABEL[r.type]}
                    {r.hidden && <span className="hint"> · 가려짐</span>}
                  </td>
                  <td>{r.room}</td>
                  <td>
                    <a href={r.url}>{r.text || "(내용 없음)"}</a>
                  </td>
                  <td className="num">{r.reports}</td>
                  <td>{r.reasons}</td>
                  <td>{new Date(r.last_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{(HIDE_TYPES as string[]).includes(r.type) && <AdminHideButton type={r.type} id={r.id} hidden={r.hidden} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const kst = (t: string) => new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 🧹 올린 직후 바로 가린 것(조롱·도배, 쓴 사람에게만 보임) + 운영자가 가린 것 (10/29). 오판이면 다시 보이기 */
async function AutoHiddenPanel() {
  const items = await listAutoHidden(7, 50);
  return (
    <section className="panel" aria-labelledby="autohidden-h">
      <h2 id="autohidden-h">
        🧹 바로 가린 것 {items.length > 0 && <span className="count-badge">{items.length}</span>}{" "}
        <span className="hint">— 최근 7일. 조롱·도배는 쓴 사람에게만 보여요. 오판이면 다시 보이기</span>
      </h2>
      {items.length === 0 ? (
        <p className="hint">최근 7일 바로 가린 것이 없습니다.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>종류</th>
                <th>방</th>
                <th>내용</th>
                <th>이유</th>
                <th>시각</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={`${r.type}-${r.id}`}>
                  <td>{REPORT_TYPE_LABEL[r.type]}</td>
                  <td>{r.room}</td>
                  <td>
                    <a href={r.url}>{r.text || "(내용 없음)"}</a>
                  </td>
                  <td>
                    {r.reason === "troll" ? "조롱·도배" : "운영자"}
                    {r.evidence && <span className="hint"> · {r.evidence}</span>}
                  </td>
                  <td>{kst(r.hidden_at)}</td>
                  <td>
                    <AdminHideButton type={r.type} id={r.id} hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** 🔁 똑같은 글을 여러 번 (10/29 대표님 "도배는 놔두고 똑같은 글 여러 번은 보고"). 보고만 */
async function DuplicatesPanel() {
  const items = await listDuplicates(1, 30);
  return (
    <section className="panel" aria-labelledby="dups-h">
      <h2 id="dups-h">
        🔁 똑같은 글 여러 번 {items.length > 0 && <span className="count-badge">{items.length}</span>} <span className="hint">— 최근 24시간. 보고만 해요</span>
      </h2>
      {items.length === 0 ? (
        <p className="hint">최근 24시간 똑같은 글이 없습니다.</p>
      ) : (
        <ul>
          {items.map((d) => (
            <li key={`${d.type}-${d.ids.join(",")}`}>
              {REPORT_TYPE_LABEL[d.type]} · {d.room} · <b>{d.count}번</b> ({d.authors}명) · {d.text} <span className="hint">· #{d.ids.join(", #")} · {kst(d.last_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
