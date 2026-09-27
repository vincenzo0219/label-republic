import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_REASONS, moderationLog, transparencyStats, type ModerationLogRow } from "@/lib/repo/legal";
import { BOARD_REJECT_REASONS, MOD_ACTIONS } from "@/lib/repo/operator";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "투명성 기록",
  description: "라벨공화국의 자동 블라인드, 법적 임시조치, 운영자 정정 조치 공개 기록",
  alternates: { canonical: "/transparency" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

function reasonLabel(r: ModerationLogRow) {
  if (!r.reason) return "-";
  return (LEGAL_REASONS as Record<string, string>)[r.reason] ?? (BOARD_REJECT_REASONS as Record<string, string>)[r.reason] ?? r.reason;
}

function subjectLabel(r: ModerationLogRow) {
  if (r.subject_type === "post") return `글 #${r.subject_id}`;
  if (r.subject_type === "board_request") return `보드 요청 #${r.subject_id}`;
  return "신고자 1명";
}

export default async function TransparencyPage() {
  const [stats, log] = await Promise.all([transparencyStats(), moderationLog(100)]);
  return (
    <article className="legal">
      <h1>투명성 기록</h1>
      <p>
        라벨공화국에는 방장이 없습니다. 글이 가려지는 경우는 두 가지뿐입니다. 이용자 신고에 따른 <b>자동 블라인드</b>와, 권리침해 신고에 따른 운영자의{" "}
        <b>법적 임시조치</b>(정보통신망법 제44조의2)입니다. 운영자는 그 밖에 탐지된 신고·투표 조작의 무효화, AI 광고 의심 오탐 해제, 작성자 재검토 요청 기각,
        보드 개설 요청 정리만 할 수 있습니다. 운영자의 조치는 한 건도 빠짐없이 아래에 공개됩니다. 규칙은 <Link href="/policy">커뮤니티 운영 원칙</Link>에
        있습니다.
      </p>

      <h2>월별 집계 (최근 6개월)</h2>
      <div className="table-scroll" role="region" aria-label="월별 집계 표" tabIndex={0}>
        <table className="data-table">
        <thead>
          <tr>
            <th>월</th>
            <th className="num">자동 블라인드</th>
            <th className="num">법적 임시조치</th>
            <th className="num">임시조치 해제</th>
            <th className="num">운영자 정정</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.month}>
              <td>{s.month}</td>
              <td className="num">{s.auto_blinds}</td>
              <td className="num">{s.legal_holds}</td>
              <td className="num">{s.legal_releases}</td>
              <td className="num">{s.corrections}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <h2>운영자 조치 기록</h2>
      {log.length === 0 ? (
        <p className="hint">아직 운영자 조치 기록이 없습니다.</p>
      ) : (
        <div className="table-scroll" role="region" aria-label="운영자 조치 기록 표" tabIndex={0}>
          <table className="data-table log-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>조치</th>
              <th>대상</th>
              <th>사유</th>
              <th className="num">건수</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            {log.map((r) => (
              <tr key={r.id}>
                <td>{fmt(r.created_at)}</td>
                <td>{MOD_ACTIONS[r.action] ?? r.action}</td>
                <td>{subjectLabel(r)}</td>
                <td>{reasonLabel(r)}</td>
                <td className="num">{r.affected || "-"}</td>
                <td>{r.note || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <p className="hint">신고인 정보, 게시글 내용, 작성자의 재검토 요청 내용은 공개하지 않습니다. 어뷰징 알림을 오탐으로 닫는 것은 아무것도 바꾸지 않으므로 기록하지 않습니다.</p>
    </article>
  );
}
