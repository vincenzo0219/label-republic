import type { Metadata } from "next";
import Link from "next/link";
import { StatusPill } from "@/components/admin/charts";
import { ALERT_LABEL, alertSubject, alertSummary } from "@/components/admin/alert-text";
import { AlertActions, AttrAliasActions, AttrAliasRemove, BoardRequestActions, BrandAliasActions, BrandAliasRemove, ProductMergeActions, RejectAppeal, ReleaseSuppression } from "@/components/admin/ModerationActions";
import { listForReview as listBrandAliasesForReview, previewProposal } from "@/lib/repo/brand-aliases";
import { listForReview as listAttrAliasesForReview, previewProposal as previewAttrProposal } from "@/lib/repo/attr-aliases";
import {
  listAlertsForReview,
  listDuplicateProductCandidates,
  listOpenAppeals,
  listOpenBoardRequestsForReview,
  listRecentAutoBlinds,
  listSuppressed,
} from "@/lib/repo/operator";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "모더레이션", robots: { index: false, follow: false } };

function fmt(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function ModerationPage() {
  const [appeals, alerts, suppressed, blinds, boardReqs, dupes, brandAliases, attrAliases] = await Promise.all([
    listOpenAppeals(),
    listAlertsForReview(),
    listSuppressed(),
    listRecentAutoBlinds(),
    listOpenBoardRequestsForReview(),
    listDuplicateProductCandidates(),
    listBrandAliasesForReview(),
    listAttrAliasesForReview(),
  ]);
  const attrPlans = new Map(
    await Promise.all(attrAliases.open.map(async (p) => [p.id, await previewAttrProposal(p.id).catch(() => null)] as const)),
  );
  // 확정하면 무엇이 바뀌는지 미리 계산 (대표 브랜드·옮길 제품·되돌릴 수 없는 병합) — Sprint 33
  const plans = new Map(
    await Promise.all(brandAliases.open.map(async (p) => [p.id, await previewProposal(p.id).catch(() => null)] as const)),
  );

  return (
    <div className="admin">
      <header className="admin-head">
        <h1>모더레이션</h1>
        <p className="hint">
          <Link href="/admin">← 운영 대시보드</Link> · 운영자는 글을 골라 숨기거나 되살리지 않습니다. 탐지된 조작의 무효화, AI 오탐 해제, 재검토 요청 처리,
          보드 요청·중복 제품 정리만 하며 <b>모든 조치는 <Link href="/transparency">투명성 기록</Link>에 공개</b>됩니다 (알림을 오탐으로 닫는 것만 내부 기록).
        </p>
      </header>

      <section className="panel" aria-labelledby="appeals-h">
        <h2 id="appeals-h">재검토 요청 {appeals.length > 0 && <span className="count-badge">{appeals.length}</span>}</h2>
        <p className="hint">
          조작 알림이 있으면 알림을 무효화하세요 — 글이 다시 보이면 요청은 자동으로 수용됩니다. 광고 의심은 오탐이면 해제합니다. 근거가 없으면 사유와 함께
          기각합니다.
        </p>
        {appeals.length === 0 ? (
          <p className="hint">대기 중인 요청이 없습니다.</p>
        ) : (
          <ul className="mod-list">
            {appeals.map((a) => (
              <li key={a.post_id}>
                <div className="mod-row">
                  <Link href={`/posts/${a.post_id}`}>
                    글 #{a.post_id} · {a.title}
                  </Link>
                  <span className="badge badge-pending">{a.kind === "blinded" ? "🚫 블라인드" : "⚠ 광고 의심"}</span>
                  <span className="hint">{fmt(a.created_at)}</span>
                </div>
                <p className="hint">
                  신고 {a.report_count}건 (가중치 {a.report_score.toFixed(1)}){a.moderation_note ? ` · AI: ${a.moderation_note}` : ""}
                  {a.open_alert_ids.length > 0 ? ` · 열린 조작 알림 ${a.open_alert_ids.map((id) => `#${id}`).join(", ")} ↓` : " · 조작 알림 없음"}
                </p>
                {a.message && <blockquote className="appeal-msg">{a.message}</blockquote>}
                {a.is_suppressed && !a.is_blinded && <ReleaseSuppression postId={a.post_id} />}
                <RejectAppeal postId={a.post_id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="alerts-h">
        <h2 id="alerts-h">
          어뷰징 알림 {alerts.open.length > 0 && <span className="count-badge">{alerts.open.length}</span>}
        </h2>
        <p className="hint">
          무효화 대상은 탐지 기준과 같습니다: 알림 대상에 대해 첫 활동 후 1시간 이내의 fingerprint가 한 신고·투표 (대량 신고자는 그 사람의 신고 전부). 무효화 후
          신고 수·블라인드·추천 수는 자동 규칙으로 다시 계산됩니다. 이미 개설된 보드는 되돌리지 않습니다. 규칙 투표 조작 의심은 자격을 갓 채운 계정의 몰림·같은 망의 새 계정 표가
          대상이고, 알림이 열려 있는 동안 그 투표의 마감이 최대 3일 미뤄집니다.
        </p>
        {alerts.open.length === 0 ? (
          <p className="hint">열린 알림이 없습니다.</p>
        ) : (
          <ul className="mod-list">
            {alerts.open.map((a) => (
              <li key={a.id}>
                <div className="mod-row">
                  <StatusPill status={a.severity} />
                  <b>
                    #{a.id} {ALERT_LABEL[a.kind] ?? a.kind}
                  </b>
                  <span>{alertSubject(a)}</span>
                  <span className="hint">
                    {fmt(a.first_seen)} ~ {fmt(a.last_seen)} · {a.hits}회 탐지
                  </span>
                </div>
                <p className="hint">{alertSummary(a)}</p>
                <AlertActions alertId={a.id} />
              </li>
            ))}
          </ul>
        )}
        {alerts.recent.length > 0 && (
          <details className="table-view">
            <summary>최근 처리한 알림 {alerts.recent.length}건</summary>
            <table className="data-table">
              <thead>
                <tr>
                  <th>알림</th>
                  <th>처리</th>
                  <th>메모</th>
                  <th>시각</th>
                </tr>
              </thead>
              <tbody>
                {alerts.recent.map((a) => (
                  <tr key={a.id}>
                    <td>
                      #{a.id} {ALERT_LABEL[a.kind] ?? a.kind}
                    </td>
                    <td>{a.status === "actioned" ? "무효화" : "오탐"}</td>
                    <td>{a.resolution_note || "-"}</td>
                    <td>{fmt(a.resolved_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      <section className="panel-grid">
        <div className="panel">
          <h2>광고 의심 글 ({suppressed.length})</h2>
          <p className="hint">AI·규칙이 노출을 낮춘 글입니다. 명백한 오탐만 해제하세요 — 광고인지 애매하면 추천·신고에 맡깁니다.</p>
          {suppressed.length === 0 ? (
            <p className="hint">없음</p>
          ) : (
            <ul className="mod-list">
              {suppressed.map((p) => (
                <li key={p.id}>
                  <div className="mod-row">
                    <Link href={`/posts/${p.id}`}>
                      #{p.id} {p.title}
                    </Link>
                    <span className="hint">
                      점수 {p.spam_score.toFixed(2)} · ▲{p.net} · 신고 {p.report_count}
                    </span>
                  </div>
                  {p.moderation_note && <p className="hint">{p.moderation_note}</p>}
                  <ReleaseSuppression postId={p.id} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2>최근 자동 블라인드</h2>
          <p className="hint">읽기 전용입니다. 블라인드를 직접 풀 수는 없고, 조작 알림이 있을 때 무효화로만 자동 규칙을 다시 적용합니다.</p>
          {blinds.length === 0 ? (
            <p className="hint">없음</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>글</th>
                  <th className="num">신고</th>
                  <th>알림</th>
                  <th>시각</th>
                </tr>
              </thead>
              <tbody>
                {blinds.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/posts/${b.id}`}>#{b.id}</Link> {b.title}
                    </td>
                    <td className="num">
                      {b.report_count} ({b.report_score.toFixed(1)}){b.voided_reports ? ` · 무효 ${b.voided_reports}` : ""}
                    </td>
                    <td>{b.open_alert_ids.length ? b.open_alert_ids.map((id) => `#${id}`).join(", ") : "-"}</td>
                    <td>{fmt(b.blinded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby="boards-h">
        <h2 id="boards-h">보드 개설 요청 ({boardReqs.length})</h2>
        <p className="hint">개설은 투표로 자동 결정됩니다. 불법·스팸·특정인 대상 요청만 거절하고, 같은 주제의 요청은 병합해 표를 모읍니다.</p>
        {boardReqs.length === 0 ? (
          <p className="hint">진행 중인 요청이 없습니다.</p>
        ) : (
          <ul className="mod-list">
            {boardReqs.map((r) => (
              <li key={r.id}>
                <div className="mod-row">
                  <b>
                    #{r.id} {r.requested_name}
                  </b>
                  <span className="hint">
                    {r.vote_count}표 · {fmt(r.created_at)}
                  </span>
                </div>
                {r.description && <p className="hint">{r.description}</p>}
                <BoardRequestActions requestId={r.id} others={boardReqs.filter((o) => o.id !== r.id).map((o) => ({ id: o.id, name: o.requested_name }))} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="products-h">
        <h2 id="products-h">중복 의심 제품 ({dupes.length})</h2>
        <p className="hint">
          같은 보드에서 이름이 비슷한 제품입니다. 같은 제품의 다른 표기(영문·한글 브랜드, 용량 표기)일 때만 병합하세요. 용량·맛이 다른 제품은 다른 제품입니다.
        </p>
        {dupes.length > 0 && (
          <ul className="mod-list">
            {dupes.map((d) => (
              <li key={`${d.a_id}-${d.b_id}`}>
                <div className="mod-row">
                  <span>
                    <Link href={`/p/${d.a_id}`}>#{d.a_id} {d.a_label}</Link> <span className="hint">글 {d.a_posts}</span> ↔{" "}
                    <Link href={`/p/${d.b_id}`}>#{d.b_id} {d.b_label}</Link> <span className="hint">글 {d.b_posts}</span>
                  </span>
                  <span className="hint">
                    {d.category_name} · 유사도 {Math.round(d.similarity * 100)}%
                  </span>
                </div>
                <ProductMergeActions a={{ id: d.a_id, label: d.a_label }} b={{ id: d.b_id, label: d.b_label }} />
              </li>
            ))}
          </ul>
        )}
        <p className="hint">번호로 직접 병합:</p>
        <ProductMergeActions />
      </section>

      <section className="panel" aria-labelledby="brand-alias-h">
        <h2 id="brand-alias-h">브랜드 별칭 제안 ({brandAliases.open.length})</h2>
        <p className="hint">
          이용자가 브랜드 페이지에서 올린 &ldquo;같은 브랜드&rdquo; 제안입니다. <b>커뮤니티 동의를 얻은 제안만 확정</b>할 수 있고, 확정하면 제품이 많은 쪽이 대표가
          되며 같은 보드의 같은 이름 제품은 병합됩니다. 수입사·판매처·자회사처럼 제조사가 다른 경우는 기각하세요.
        </p>
        {brandAliases.open.length > 0 && (
          <ul className="mod-list">
            {brandAliases.open.map((p) => (
              <li key={p.id}>
                <div className="mod-row">
                  <span>
                    <Link href={`/brand/${encodeURIComponent(p.brand_a)}`}>{p.label_a}</Link> = <Link href={`/brand/${encodeURIComponent(p.brand_b)}`}>{p.label_b}</Link>{" "}
                    <span className="hint">
                      #{p.id} · {p.nickname} · 동의 {p.agree_count} · 반대 {p.disagree_count}
                    </span>
                  </span>
                  <span className="hint">{p.is_supported ? "✔ 동의됨" : "의견 받는 중"}</span>
                </div>
                <p className="hint" style={{ margin: "4px 0" }}>{p.reason_hidden ? "(사유 가림)" : p.reason}</p>
                {plans.get(p.id) && (
                  <p className="hint" style={{ margin: "4px 0" }}>
                    확정하면: 대표 <b>{plans.get(p.id)!.canonicalLabel}</b> ← {plans.get(p.id)!.aliasLabel} · 대표 키로 옮길 제품 {plans.get(p.id)!.rekey} ·{" "}
                    <b>병합 {plans.get(p.id)!.merges.length}</b>
                    {plans.get(p.id)!.merges.length > 0 &&
                      ` (${plans.get(p.id)!.merges.map((m) => `${m.category} #${m.from.id} ${m.from.name} → #${m.into.id}`).join(", ")})`}
                  </p>
                )}
                <BrandAliasActions proposalId={p.id} supported={p.is_supported} pair={`${p.label_a} = ${p.label_b}`} plan={plans.get(p.id) ?? null} />
              </li>
            ))}
          </ul>
        )}
        {brandAliases.aliases.length > 0 && (
          <>
            <p className="hint">확정된 별칭 (잘못 확정했으면 해제):</p>
            <ul className="mod-list">
              {brandAliases.aliases.map((a) => (
                <li key={a.alias_key}>
                  <div className="mod-row">
                    <span>
                      {a.label} → <Link href={`/brand/${encodeURIComponent(a.canonical_key)}`}>{a.canonical_label}</Link>
                    </span>
                    <span className="hint">{fmt(a.created_at)}</span>
                  </div>
                  <BrandAliasRemove aliasKey={a.alias_key} pair={`${a.label} → ${a.canonical_label}`} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="attr-alias-h">
        <h2 id="attr-alias-h">성분명 별칭 제안 ({attrAliases.open.length})</h2>
        <p className="hint">
          이용자가 보드의 성분 순위 화면에서 올린 &ldquo;같은 성분&rdquo; 제안입니다. <b>커뮤니티 동의를 얻은 제안만 확정</b>할 수 있고, 확정하면 제품이 많은 쪽 이름이
          대표가 되어 다른 이름으로 적힌 수치가 한 순위에 모입니다(표시 이름은 그대로, 해제하면 되돌아감). 형태에 따라 함량 기준이 다른 성분(엽산과 DFE, 비타민 A 와
          베타카로틴 등)은 기각하세요.
        </p>
        {attrAliases.open.length > 0 && (
          <ul className="mod-list">
            {attrAliases.open.map((p) => {
              const plan = attrPlans.get(p.id) ?? null;
              return (
                <li key={p.id}>
                  <div className="mod-row">
                    <span>
                      {p.board} · {p.label_a} = {p.label_b}{" "}
                      <span className="hint">
                        #{p.id} · {p.nickname} · 동의 {p.agree_count} · 반대 {p.disagree_count}
                      </span>
                    </span>
                    <span className="hint">{p.is_supported ? "✔ 동의됨" : "의견 받는 중"}</span>
                  </div>
                  <p className="hint" style={{ margin: "4px 0" }}>{p.reason_hidden ? "(사유 가림)" : p.reason}</p>
                  {plan && (
                    <p className="hint" style={{ margin: "4px 0" }}>
                      확정하면: 대표 <b>{plan.canonicalLabel}</b> ← {plan.aliasLabel} · 옮길 수치 {plan.facts} (제품 {plan.products})
                      {plan.iuConverted > 0 && ` · IU 를 µg 으로 환산해 비교하게 되는 수치 ${plan.iuConverted}`}
                      {plan.unitGroups.alias.some((g) => !plan.unitGroups.canonical.includes(g)) &&
                        ` · 단위가 달라 따로 비교되는 값 있음 (${plan.unitGroups.alias.filter((g) => !plan.unitGroups.canonical.includes(g)).join(", ")})`}
                    </p>
                  )}
                  <AttrAliasActions proposalId={p.id} supported={p.is_supported} pair={`${p.board} · ${p.label_a} = ${p.label_b}`} plan={plan} />
                </li>
              );
            })}
          </ul>
        )}
        {attrAliases.aliases.length > 0 && (
          <details>
            <summary className="hint">확정된 별칭·기본 사전 ({attrAliases.aliases.length}) — 잘못 묶였으면 해제</summary>
            <ul className="mod-list">
              {attrAliases.aliases.map((a) => (
                <li key={`${a.category_id}:${a.alias_key}`}>
                  <div className="mod-row">
                    <span>
                      {a.board} · {a.label} → {a.canonical_key}
                      {a.builtin && <span className="hint"> (기본 사전)</span>}
                    </span>
                    <span className="hint">{fmt(a.created_at)}</span>
                  </div>
                  <AttrAliasRemove categoryId={a.category_id} aliasKey={a.alias_key} pair={`${a.board} · ${a.label} → ${a.canonical_key}`} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
