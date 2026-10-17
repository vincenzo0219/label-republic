import type { Metadata } from "next";
import Link from "next/link";
import { hearingStats } from "@/lib/repo/hearingTest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "고음 몇 kHz까지 들릴까? 고음 청력 테스트 결과",
  description: "8~20kHz 고음을 들려준 실제 참가자 결과. 주파수별로 들린 사람 비율.",
  alternates: { canonical: "/data/hearing-test" },
};

/** 🦟 고음 청력 테스트 실제 결과 (Sprint 75, 검색 유입용) */
export default async function Page() {
  const s = await hearingStats();
  return (
    <article className="data-page">
      <h1>고음, 몇 kHz까지 들릴까?</h1>
      <p className="hint">노방장 고음 청력 테스트 참가자 {s.participants}명의 실제 결과 (첫 응시만)</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>주파수</th>
            <th>들린 사람</th>
          </tr>
        </thead>
        <tbody>
          {s.byKhz.map((r) => (
            <tr key={r.khz}>
              <td>{r.khz}kHz</td>
              <td>
                <b>{Math.round(r.rate * 100)}%</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>평균 {s.average ?? "-"}kHz. 기기·이어폰에 따라 달라질 수 있는 참고 결과예요.</p>
      <Link href="/hearing-test?from=data" className="btn btn-primary">
        🦟 나도 해 보기 (1분)
      </Link>
    </article>
  );
}
