import Link from "next/link";
import { formatValue } from "@/lib/products";
import type { FactGroup } from "@/lib/repo/products";

/** 실측이 표시와 이만큼 이상 다르면 눈에 띄게 */
const NOTABLE_DIFF_PCT = 10;

function diffText(pct: number) {
  const r = Math.round(Math.abs(pct));
  if (r === 0) return "표시값과 같음";
  return `표시보다 ${r}% ${pct > 0 ? "많음" : "적음"}`;
}

/** 제품 페이지: 글마다 적은 수치를 항목별로 모은 표 (중앙값) */
export function ProductFacts({ groups, boardPath }: { groups: FactGroup[]; boardPath?: string }) {
  if (!groups.length) {
    return <p className="hint">아직 이 제품의 수치를 적은 글이 없습니다. 글을 쓸 때 제품을 태그하고 성분 함량·스펙을 적어주세요.</p>;
  }
  return (
    <>
      <div className="table-scroll" role="region" aria-label="제품 수치 표" tabIndex={0}>
        <table className="data-table facts-table">
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">기준</th>
              <th scope="col" className="num">표시값</th>
              <th scope="col" className="num">실측값</th>
              <th scope="col">차이</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}>
                <th scope="row">
                  {boardPath ? (
                    <Link href={`${boardPath}/facts?attr=${encodeURIComponent(g.key.split("|")[0]!)}&basis=${encodeURIComponent(g.key.split("|")[1]!)}`} title="이 항목의 보드 순위 보기">
                      {g.attribute}
                    </Link>
                  ) : (
                    g.attribute
                  )}
                </th>
                <td>{g.basis || "-"}</td>
                <td className="num">
                  {g.label ? (
                    <>
                      {formatValue(g.label.median)} {g.unit}
                      {g.label.n > 1 && <span className="hint"> ({g.label.n}개 글)</span>}
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="num">
                  {g.measured ? (
                    <>
                      {formatValue(g.measured.median)} {g.unit}
                      {g.measured.n > 1 && <span className="hint"> ({g.measured.n}개 글)</span>}
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  {g.disputed_n > 0 && !g.label && !g.measured ? (
                    <span className="hint">정정 제안으로 집계 제외</span>
                  ) : g.diff_pct === null ? (
                    <span className="hint">-</span>
                  ) : (
                    <span className={Math.abs(g.diff_pct) >= NOTABLE_DIFF_PCT ? "diff diff-notable" : "diff"}>
                      {Math.abs(g.diff_pct) >= NOTABLE_DIFF_PCT ? "⚠ " : ""}
                      {diffText(g.diff_pct)}
                    </span>
                  )}
                  <details className="fact-entries">
                    <summary>
                      글별 값 {g.entries.length}
                      {g.entries.some((e) => e.photo) && ` · 📷 사진 근거 ${g.entries.filter((e) => e.photo).length}`}
                      {g.disputed_n > 0 && ` · 정정 제안 ${g.disputed_n}건 제외`}
                    </summary>
                    <ul>
                      {g.entries.map((e, i) => (
                        <li key={i}>
                          <Link href={`/posts/${e.post_id}`}>글 #{e.post_id}</Link> · {formatValue(e.value)} {e.unit} ({e.kind === "label" ? "표시" : "실측"})
                          {e.photo && " · 📷 사진 근거"}
                          {e.disputed && (
                            <>
                              {" "}
                              · <Link href={`/posts/${e.post_id}#corrections`}>🛠 동의된 정정 제안 — 집계 제외</Link>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        여러 글이 같은 항목을 적었으면 중앙값을 보여줍니다. mg·µg·g 처럼 바꿔 계산할 수 있는 단위는 맞춰서 비교하고, 기준(1정, 1일 섭취량 등)이 다르면 따로 봅니다.
        블라인드·광고 의심 글의 값과, 커뮤니티가 동의한 정정 제안이 걸린 값은 빠집니다.
      </p>
    </>
  );
}
