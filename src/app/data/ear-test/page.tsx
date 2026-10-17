import type { Metadata } from "next";
import Link from "next/link";
import { earStats } from "@/lib/repo/earTest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MP3 음질 차이, 진짜 들릴까? 블라인드 테스트 결과",
  description: "원본과 MP3 압축본(64~192kbps)을 블라인드로 구분한 실제 참가자 결과. 비트레이트별 정답률.",
  alternates: { canonical: "/data/ear-test" },
};

/** 🎧 황금귀 테스트 실제 결과 (Sprint 75, 검색 유입용) */
export default async function Page() {
  const s = await earStats();
  return (
    <article className="data-page">
      <h1>MP3 음질 차이, 진짜 들릴까?</h1>
      <p className="hint">노방장 황금귀 테스트 참가자 {s.participants}명의 실제 결과 (첫 응시만)</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>원본 vs 압축본</th>
            <th>맞힌 비율</th>
          </tr>
        </thead>
        <tbody>
          {s.byKbps.map((r) => (
            <tr key={r.kbps}>
              <td>{r.kbps}kbps</td>
              <td>
                <b>{Math.round(r.rate * 100)}%</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>10문제 평균 {s.average ?? "-"}개. 찍으면 50%라서, 50%에 가까울수록 대부분 구분하지 못했다는 뜻이에요.</p>
      <Link href="/ear-test?from=data" className="btn btn-primary">
        🎧 나도 해 보기 (1분)
      </Link>
    </article>
  );
}
