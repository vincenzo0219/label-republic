import Link from "next/link";
import { formatValue } from "@/lib/products";
import type { FactGroup, LabelEra } from "@/lib/repo/products";
import { changePct, changePeriodText } from "@/lib/renewals";

function pctText(from: number, to: number): string {
  const p = changePct(from, to);
  if (p === null) return "";
  const r = Math.round(Math.abs(p));
  return r === 0 ? "" : ` (${p > 0 ? "+" : "−"}${r}%)`;
}

/** 바뀐 시기 문구 — 양쪽 제보에 라벨 날짜가 있으면 "제조 …", 아니면 글 올린 시기 기준임을 밝힌다 (Sprint 26) */
function whenText(prev: LabelEra, cur: LabelEra): string {
  const period = changePeriodText(prev.last_at, cur.first_at);
  return prev.last_basis !== "posted" && cur.first_basis !== "posted" ? `제조 ${period}에 바뀜` : `${period}에 바뀜 (글 올린 시기로 추정)`;
}

function label(g: FactGroup) {
  return g.basis ? `${g.attribute} (${g.basis})` : g.attribute;
}

/**
 * 제품 페이지 상단: 라벨이 바뀐 항목(리뉴얼)과, 최근 다른 값이 올라와 확인이 필요한 항목 (Sprint 25).
 * 판단은 규칙(src/lib/renewals.ts)이 하고, 운영자는 관여하지 않는다.
 */
export function LabelChanges({ groups, writeHref, minReports }: { groups: FactGroup[]; writeHref: string; minReports: number }) {
  const renewed = groups.filter((g) => g.eras);
  const pending = groups.filter((g) => g.pending);
  if (!renewed.length && !pending.length) return null;
  return (
    <div className="label-changes">
      {renewed.length > 0 && (
        <div className="notice notice-renewal" role="note" aria-labelledby="lc-renewed-h">
          <h3 id="lc-renewed-h">🔄 라벨이 바뀐 것으로 보여요 (리뉴얼)</h3>
          <ul>
            {renewed.map((g) => {
              const eras = g.eras!;
              const prev = eras[eras.length - 2]!;
              const cur = eras[eras.length - 1]!;
              return (
                <li key={g.key}>
                  <b>{label(g)}</b>: {formatValue(prev.value)} → <b>{formatValue(cur.value)} {g.unit}</b>
                  {pctText(prev.value, cur.value)} · {whenText(prev, cur)}
                  <span className="hint">
                    {" "}
                    — 새 값 글 {cur.n}개(작성자 {cur.authors}명{cur.photos ? `, 📷 사진 근거 ${cur.photos}` : ""})
                  </span>
                  {eras.length > 2 && (
                    <details className="era-history">
                      <summary>이전 변경 {eras.length - 2}번 더 보기</summary>
                      <ol>
                        {eras.map((e, i) => (
                          <li key={i}>
                            {formatValue(e.value)} {g.unit} — 글 {e.n}개
                            {i > 0 ? ` · ${whenText(eras[i - 1]!, e).replace(/에 바뀜/, "부터")}` : ""}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="hint">
            시기는 글에 적힌 라벨 날짜(제조일자·유통기한)로 추정한 제조 시기로 나누고, 날짜가 없는 글은 올린 시기로 추정해요. 아래 표의 표시값·실측값은 바뀐 뒤 제품의 글만으로 계산해요. 바뀌기 전 글의 값은 &ldquo;글별 값&rdquo;에 &ldquo;리뉴얼 전&rdquo;으로 남아 있어요. 기준: 바뀐 뒤 서로 다른 {minReports}명 이상이 같은 새 값을 올림 (
            <Link href="/rules">커뮤니티 규칙</Link>).
          </p>
        </div>
      )}
      {pending.length > 0 && (
        <div className="notice notice-pending" role="note" aria-labelledby="lc-pending-h">
          <h3 id="lc-pending-h">🔍 라벨 확인이 필요해요</h3>
          <ul>
            {pending.map((g) => {
              const p = g.pending!;
              return (
                <li key={g.key}>
                  <b>{label(g)}</b>: 지금까지 {formatValue(p.from)} {g.unit}였는데, 최근 글 {p.n}개가 <b>{formatValue(p.to)} {g.unit}</b>로 적었어요
                  {p.photos ? ` (📷 사진 근거 ${p.photos})` : ""}.{" "}
                  {p.post_ids.slice(0, 3).map((id, i) => (
                    <span key={id}>
                      {i > 0 && " · "}
                      <Link href={`/posts/${id}`}>글 #{id}</Link>
                    </span>
                  ))}
                  <span className="hint">
                    {p.needed > 0
                      ? ` — 다른 이용자 ${p.needed}명이 더 같은 값을 올리면 리뉴얼로 반영돼요.`
                      : " — 옛 값 제보와 섞여 있어 아직 리뉴얼로 보지 않았어요."}
                  </span>
                </li>
              );
            })}
          </ul>
          <p>
            이 제품을 갖고 있다면 라벨을 확인해 주세요.{" "}
            <Link className="btn btn-sm" href={writeHref}>
              📷 라벨 사진으로 확인 글쓰기
            </Link>
          </p>
          <p className="hint">
            제조일자·유통기한이 찍힌 부분도 함께 찍어 주세요 — 언제 만든 제품인지로 옛 재고와 새 라벨을 구분해요. 오타일 수도 있어요. 값이 틀렸다면 그 글에 정정 제안을 남겨 주세요.
          </p>
        </div>
      )}
    </div>
  );
}
