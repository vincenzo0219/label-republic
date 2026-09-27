import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_REASONS, moderationLog, transparencyStats, type LegalReason } from "@/lib/repo/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "투명성 기록",
  description: "라벨공화국의 자동 블라인드와 법적 임시조치 공개 기록",
  alternates: { canonical: "/transparency" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default async function TransparencyPage() {
  const [stats, log] = await Promise.all([transparencyStats(), moderationLog(100)]);
  return (
    <article className="legal">
      <h1>투명성 기록</h1>
      <p>
        라벨공화국에는 방장이 없습니다. 글이 가려지는 경우는 두 가지뿐입니다. 이용자 신고에 따른 <b>자동 블라인드</b>와, 권리침해 신고에 따른 운영자의{" "}
        <b>법적 임시조치</b>(정보통신망법 제44조의2)입니다. 임시조치는 한 건도 빠짐없이 아래에 공개됩니다. 규칙은{" "}
        <Link href="/policy">커뮤니티 운영 원칙</Link>에 있습니다.
      </p>

      <h2>월별 집계 (최근 6개월)</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>월</th>
            <th className="num">자동 블라인드</th>
            <th className="num">법적 임시조치</th>
            <th className="num">임시조치 해제</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.month}>
              <td>{s.month}</td>
              <td className="num">{s.auto_blinds}</td>
              <td className="num">{s.legal_holds}</td>
              <td className="num">{s.legal_releases}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>법적 임시조치 기록</h2>
      {log.length === 0 ? (
        <p className="hint">아직 임시조치 기록이 없습니다.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>조치</th>
              <th>사유</th>
              <th>게시글</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            {log.map((r) => (
              <tr key={r.id}>
                <td>{fmt(r.created_at)}</td>
                <td>{r.action === "legal_hold" ? "임시조치" : "해제"}</td>
                <td>{r.reason ? LEGAL_REASONS[r.reason as LegalReason] : "-"}</td>
                <td>#{r.post_id}</td>
                <td>{r.note || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">신고인 정보와 게시글 내용은 공개하지 않습니다.</p>
    </article>
  );
}
