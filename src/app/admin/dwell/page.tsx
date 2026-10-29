import { dwellStats, kstDay, roomTabStats } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** ⏱ /admin/dwell — 페이지별 체류시간 (10/29). 보이는 동안 머문 시간의 중앙값, 평균 스크롤, 첫 행사 카드까지 내려간 비율 */
export default async function DwellPage() {
  const to = kstDay();
  const from = kstDay(new Date(Date.now() - 6 * 86400_000));
  const [rows, tabs] = await Promise.all([dwellStats(from, to, { limit: 30 }), roomTabStats(from, to)]);
  return (
    <section className="panel">
      <h1>⏱ 체류시간 ({from} ~ {to})</h1>
      <p className="hint">페이지를 떠날 때 한 번 기록. 머문 시간은 화면이 보이는 동안만 셉니다. 0.5초 미만은 뺍니다.</p>
      {rows.length === 0 ? (
        <p className="hint">아직 기록이 없어요.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>페이지</th><th>조회</th><th>체류 중앙값</th><th>평균 스크롤</th><th>첫 행사 카드까지</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.path}>
                <td>{decodeURIComponent(r.path)}</td>
                <td className="num">{r.views}</td>
                <td className="num">{r.median_s}초</td>
                <td className="num">{r.avg_scroll}%</td>
                <td className="num">{r.marks["first-event"] !== undefined ? `${r.marks["first-event"]}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>📑 탭별 클릭 ({from} ~ {to})</h2>
      <p className="hint">방 주소의 탭(?head=·?tab=·?type=)별 조회 수. "기본"은 탭 없이 들어온 방 첫 화면이에요. 10/29 배포 뒤부터 쌓여요.</p>
      {tabs.length === 0 ? (
        <p className="hint">아직 기록이 없어요.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>방</th><th>탭</th><th>조회</th><th>체류 중앙값</th></tr>
          </thead>
          <tbody>
            {tabs.map((t) => (
              <tr key={`${t.room}|${t.tab ?? ""}`}>
                <td>{t.room}</td>
                <td>{t.tab ?? "기본"}</td>
                <td className="num">{t.views}</td>
                <td className="num">{t.median_s === null ? "-" : `${t.median_s}초`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
