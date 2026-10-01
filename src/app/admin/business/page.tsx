import type { Metadata } from "next";
import Link from "next/link";
import { DailyBars, HBarList } from "@/components/admin/charts";
import {
  growth,
  METRIC_DEFS,
  overallVerdict,
  pct,
  SIGNAL_ICON,
  SIGNAL_LABEL,
  signedPct,
  type MetricKey,
} from "@/lib/business";
import { getBusinessMetrics, listBizReports } from "@/lib/repo/business";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "사업 지표", robots: { index: false, follow: false } };

const SOURCE_LABEL: Record<string, string> = { search: "검색", direct: "직접", social: "SNS", referral: "다른 사이트" };
const ANSWER_LABEL: Record<number, string> = { 1: "매우 아쉽다", 2: "조금 아쉽다", 3: "아쉽지 않다" };
const QUESTIONS = ["PMF", "방향", "존폐", "성장"] as const;
const QUESTION_HINT: Record<(typeof QUESTIONS)[number], string> = {
  PMF: "사람들이 이걸 정말 원하나? — 다시 오는가, 습관이 됐는가, 없어지면 아쉬운가",
  방향: "어디에 집중할까? — 보는 곳인가 하는 곳인가, 어떤 방이 살아 있나",
  존폐: "계속할 수 있나? — 콘텐츠를 만드는 사람이 남아 있나, 글에 반응이 오나",
  성장: "커지고 있나? — 주간 성장, 사람이 사람을 데려오나",
};

function heat(v: number | null) {
  if (v === null) return undefined;
  const p = Math.min(60, Math.round(v * 150)); // 40% 잔존이면 가장 진하게
  return { background: `color-mix(in srgb, var(--brand) ${p}%, var(--surface))` };
}

/** 1명당 비용은 아주 작을 수 있어 유효숫자 2자리로 */
function usd(v: number | null) {
  if (v === null) return "—";
  return `$${v >= 1 ? v.toFixed(2) : v.toPrecision(2)}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function BusinessPage() {
  const [m, reports] = await Promise.all([getBusinessMetrics(), listBizReports()]);
  const verdict = overallVerdict(m.values);
  const last = m.weeks[m.weeks.length - 1];
  const prev = m.weeks[m.weeks.length - 2];
  const keys = Object.keys(METRIC_DEFS) as MetricKey[];

  return (
    <div className="admin">
      <header className="admin-head">
        <h1>📈 사업 지표</h1>
        <p className="hint">
          <Link href="/admin">← 운영 대시보드</Link> · {fmtTime(m.generatedAt)} 기준 (10분마다 갱신) · 사람 수는 쿠키(방문자)와 IP+브라우저(참여자)로 추정하므로
          기기를 바꾸면 따로 셉니다 — <b>절대값보다 추세</b>를 보세요.
        </p>
      </header>

      <section className={`verdict verdict-${verdict.signal}`} aria-labelledby="verdict-h">
        <h2 id="verdict-h">
          {SIGNAL_ICON[verdict.signal]} 종합: {SIGNAL_LABEL[verdict.signal]}
        </h2>
        <p>{verdict.text}</p>
        {last && (
          <p className="hint">
            지난주 방문자 {last.visitors.toLocaleString("ko-KR")}명 ({signedPct(prev ? growth(last.visitors, prev.visitors) : null)}) · 참여자{" "}
            {last.contributors.toLocaleString("ko-KR")}명 ({signedPct(prev ? growth(last.contributors, prev.contributors) : null)}) · 글 {last.posts} · 댓글{" "}
            {last.comments}
          </p>
        )}
      </section>

      {QUESTIONS.map((q) => (
        <section key={q} className="panel" aria-labelledby={`q-${q}`}>
          <h2 id={`q-${q}`}>{q}</h2>
          <p className="hint">{QUESTION_HINT[q]}</p>
          <div className="metric-grid">
            {keys
              .filter((k) => METRIC_DEFS[k].question === q)
              .map((k) => {
                const d = METRIC_DEFS[k];
                const v = m.values[k];
                const isGrowth = k === "growth";
                return (
                  <div key={k} className={`metric-card sig-${v.signal}`}>
                    <div className="metric-label">
                      <span aria-hidden>{SIGNAL_ICON[v.signal]}</span> {d.label} <span className="sr-only">({SIGNAL_LABEL[v.signal]})</span>
                    </div>
                    <div className="metric-value">{isGrowth ? signedPct(v.value) : pct(v.value, 1)}</div>
                    <div className="hint">
                      기준: 🟢 {isGrowth ? signedPct(d.green) : pct(d.green)} 이상 · 🟡 {isGrowth ? signedPct(d.yellow) : pct(d.yellow)} 이상
                      {v.signal === "na" && ` · 표본 ${v.sample} (최소 ${d.minSample})`}
                    </div>
                    <p className="metric-what">{d.what}</p>
                    <p className="hint">{d.why}</p>
                  </div>
                );
              })}
          </div>

          {q === "PMF" && (
            <>
              <h3>코호트 잔존율 (첫 방문 주 → N주 뒤 그 주에 다시 온 비율)</h3>
              <div className="table-scroll">
                <table className="data-table cohort-table">
                  <thead>
                    <tr>
                      <th>첫 방문 주</th>
                      <th className="num">인원</th>
                      <th className="num">1주 뒤</th>
                      <th className="num">4주 뒤</th>
                      <th className="num">8주 뒤</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.cohorts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="hint">
                          아직 지난 주에 처음 온 방문자가 없습니다.
                        </td>
                      </tr>
                    )}
                    {m.cohorts.map((c) => (
                      <tr key={c.week}>
                        <td>{c.week}</td>
                        <td className="num">{c.size.toLocaleString("ko-KR")}</td>
                        {[c.w1, c.w4, c.w8].map((v, i) => (
                          <td key={i} className="num" style={heat(v)}>
                            {v === null ? "·" : pct(v, 1)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">오른쪽으로 갈수록 숫자가 0에 가까워지지 않고 일정하게 남으면(곡선이 평평해지면) PMF 신호입니다.</p>

              <h3>&ldquo;노방장이 없어진다면?&rdquo; 설문 (최근 90일, 방문 3일 이상인 사람에게 한 번)</h3>
              <p>
                응답 {m.survey.total}개 · 매우 아쉽다 <b>{m.survey.very}</b> · 조금 아쉽다 {m.survey.somewhat} · 아쉽지 않다 {m.survey.not}
              </p>
              {m.survey.comments.length > 0 && (
                <ul className="admin-list survey-comments">
                  {m.survey.comments.map((c, i) => (
                    <li key={i}>
                      <span className="badge">{ANSWER_LABEL[c.answer]}</span> {c.comment} <span className="hint">{fmtTime(c.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {q === "방향" && (
            <>
              <p className="hint">
                최근 28일 방문자 {m.visitors28d.toLocaleString("ko-KR")}명 중 참여자 {m.contributors28d.toLocaleString("ko-KR")}명 · 지난 7일 새 참여자{" "}
                {m.newContributors7d}명 · 방 만들기 요청 {m.roomRequests.open}건 진행 중 (지난 7일 동의 {m.roomRequests.agreements7d})
              </p>
              <h3>방별 건강도 (최근 7일, 작성자 = 글·댓글 쓴 사람)</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>방</th>
                      <th className="num">작성자</th>
                      <th className="num">직전 7일</th>
                      <th className="num">글</th>
                      <th className="num">댓글</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.rooms.map((r) => (
                      <tr key={r.slug}>
                        <td>
                          <Link href={`/c/${encodeURIComponent(r.slug)}`}>{r.name}</Link>
                        </td>
                        <td className="num">{r.authors7d}</td>
                        <td className="num">{r.authorsPrev7d}</td>
                        <td className="num">{r.posts7d}</td>
                        <td className="num">{r.comments7d}</td>
                        <td>{r.authors7d >= 3 ? "🟢 살아 있음" : r.authors7d > 0 ? "🟡 조용함" : "⚪ 비어 있음"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {q === "존폐" && (
            <p className="hint">
              핵심 작성자(한 주에 이틀 이상 글·댓글): 이번 7일 <b>{m.coreThisWeek}명</b> · 4주 전 {m.coreFourWeeksAgo}명. 활동 인원 1명당 월 비용: 방문자 기준{" "}
              {usd(m.cost.perMauUsd)} · 참여자 기준 {usd(m.cost.perContributorUsd)} (월 ${m.cost.monthlyUsd}, <code>MONTHLY_COST_USD</code>)
            </p>
          )}

          {q === "성장" && (
            <div className="chart-grid">
              <DailyBars title="주간 방문자" unit="명" data={m.weeks.map((w) => ({ day: w.week, value: w.visitors }))} description="월요일 시작 주의 고유 방문자" />
              <DailyBars title="주간 참여자" unit="명" data={m.weeks.map((w) => ({ day: w.week, value: w.contributors }))} description="글·댓글·추천을 한 사람" />
              <HBarList
                title="외부 유입 경로 (최근 28일)"
                unit="회"
                empty="아직 외부 유입이 없습니다."
                rows={m.sources28d.map((s) => ({ label: SOURCE_LABEL[s.source] ?? s.source, value: s.landings }))}
              />
            </div>
          )}
        </section>
      ))}

      <section className="panel" aria-labelledby="reports-h">
        <h2 id="reports-h">주간 리포트</h2>
        <p className="hint">
          매주 월요일 9시(KST)에 지난주 리포트를 만들어 <code>REPORT_EMAIL_TO</code>(없으면 <code>CONTACT_EMAIL</code>)로 보냅니다. 메일은{" "}
          <code>RESEND_API_KEY</code> 가 있을 때, 없으면 <code>ALERT_WEBHOOK_URL</code> 로 보내고, 둘 다 없으면 여기에만 남습니다.
        </p>
        {reports.length === 0 ? (
          <p className="hint">아직 만든 리포트가 없습니다.</p>
        ) : (
          <ul className="admin-list">
            {reports.map((r) => (
              <li key={r.week_start}>
                <details>
                  <summary>
                    {r.subject} <span className="hint">· {r.sent_via === "email" ? "메일 보냄" : r.sent_via === "webhook" ? "웹훅 보냄" : "보낼 곳 없음"}</span>
                    {r.error && <span className="error"> · 전송 실패: {r.error}</span>}
                  </summary>
                  <pre className="report-text">{r.text}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
