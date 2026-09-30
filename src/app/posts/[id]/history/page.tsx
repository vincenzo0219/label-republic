import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RedactRevision } from "@/components/RedactRevision";
import { diffCost, diffLines, foldDiff } from "@/lib/diff";
import { FACT_KIND_LABEL, formatValue } from "@/lib/products";
import { listCorrections } from "@/lib/repo/corrections";
import { getPost, listRevisions } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "수정 이력", robots: { index: false, follow: true } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> };

/** 한 화면에 보여줄 수정 수와, 줄 비교에 쓸 전체 계산량(줄 수 곱의 합) */
const PER_PAGE = 10;
const PAGE_DIFF_BUDGET = 2_000_000;

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type FactLike = { product?: string; attribute: string; value: number; unit: string; basis: string; kind: "label" | "measured" };
const factLine = (f: FactLike) => `${f.product ? `${f.product} · ` : ""}${f.attribute} ${formatValue(f.value)} ${f.unit}${f.basis ? ` (${f.basis})` : ""} · ${FACT_KIND_LABEL[f.kind]}`;

function Diff({ before, after, label, budget }: { before: string; after: string; label: string; budget: { left: number } }) {
  if (before === after) return null;
  const lines = budget.left > 0 ? diffLines(before, after, budget.left) : null;
  budget.left -= diffCost(before, after);
  return (
    <div className="diff-block">
      <h3>{label}</h3>
      {lines ? (
        <pre className="diff-view" aria-label={`${label} 변경 내용`}>
          {foldDiff(lines).map((l, i) =>
            l.op === "skip" ? (
              <span key={i} className="diff-skip">
                … 같은 줄 {l.count}개 …{"\n"}
              </span>
            ) : (
              <span key={i} className={`diff-${l.op}`}>
                <span aria-hidden="true">{l.op === "add" ? "+ " : l.op === "del" ? "- " : "  "}</span>
                {l.op !== "same" && <span className="sr-only">{l.op === "add" ? "추가: " : "삭제: "}</span>}
                {l.text}
                {"\n"}
              </span>
            ),
          )}
        </pre>
      ) : (
        <p className="hint">변경이 너무 커서 줄 비교를 생략했습니다. &ldquo;이전 판 전체 보기&rdquo;로 확인하세요.</p>
      )}
    </div>
  );
}

export default async function HistoryPage({ params, searchParams }: Props) {
  const { id } = await params;
  const page = Math.max(1, Math.min(100, Number((await searchParams).page) || 1));
  const post = await getPost(id);
  if (!post || post.is_blinded) notFound();
  const offset = (page - 1) * PER_PAGE;
  // 이 쪽의 첫 판과 비교할 바로 다음(더 새) 판이 필요해서 앞쪽 하나를 더 가져온다
  const [fetched, corrections] = await Promise.all([listRevisions(id, Math.max(0, offset - 1), PER_PAGE + 2), listCorrections(id)]);
  const newerOfFirst = offset > 0 ? fetched[0] : undefined;
  const pageRevs = (offset > 0 ? fetched.slice(1) : fetched).slice(0, PER_PAGE + 1);
  const hasMore = pageRevs.length > PER_PAGE;
  const revisions = pageRevs.slice(0, PER_PAGE);
  const budget = { left: PAGE_DIFF_BUDGET };
  const names = new Map(post.products.map((p) => [p.id, `${p.brand} ${p.name}`]));
  const current = {
    title: post.title,
    body: post.body,
    facts: post.facts.map((f) => factLine({ ...f, product: names.get(f.product_id) })).join("\n"),
    at: post.updated_at,
  };
  // 최신 → 과거: 각 판을 바로 다음(더 새) 판과 비교
  const asVersion = (r: (typeof revisions)[number]) => ({ title: r.title, body: r.body, facts: r.facts.map(factLine).join("\n"), at: r.created_at, redacted: r.redacted_by });
  const versions = [newerOfFirst ? asVersion(newerOfFirst) : { ...current, redacted: null }, ...revisions.map(asVersion)];
  const applied = corrections.items.filter((c) => c.status === "applied");

  return (
    <article className="history">
      <p className="hint">
        <Link href={`/posts/${post.id}`}>← 글로 돌아가기</Link>
      </p>
      <h1 style={{ fontSize: 20, margin: "4px 0 4px" }}>수정 이력</h1>
      <p className="hint">
        {post.title} · 수정 {post.revision_count}회. 누구나 무엇이 바뀌었는지 볼 수 있습니다. 이전 판에 연락처처럼 남기면 안 되는 내용이 있으면 작성자는 그 판을
        지울 수 있습니다.
      </p>

      {applied.length > 0 && (
        <section aria-labelledby="applied-h">
          <h2 id="applied-h" className="section-h">✅ 반영된 정정 제안</h2>
          <ul className="applied-list">
            {applied.map((c) => (
              <li key={c.id}>
                <Link href={`/posts/${post.id}#correction-${c.id}`}>{c.quote}</Link> → {c.proposal}
                {c.resolved_at && <span className="hint"> · {fmt(c.resolved_at)} 반영</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {revisions.length === 0 ? (
        <p className="empty">아직 수정한 적이 없습니다.</p>
      ) : (
        <ol className="revision-list">
          {revisions.map((r, i) => {
            const newer = versions[i]!;
            const older = versions[i + 1]!;
            return (
              <li key={r.id}>
                <h2 className="section-h">
                  {fmt(r.replaced_at)} 수정 <span className="hint">(이전 판: {fmt(older.at)})</span>
                </h2>
                {older.redacted || newer.redacted ? (
                  <p className="hint">
                    🗑 {older.redacted ? (older.redacted === "legal" ? "법적 요청으로 이전 판의 내용을 지웠습니다 (투명성 기록에 공개)." : "작성자가 이전 판의 내용을 지웠습니다.") : "다음 판의 내용이 지워져 비교하지 않습니다."}
                  </p>
                ) : (
                  <>
                    <Diff label="제목" before={older.title} after={newer.title} budget={budget} />
                    <Diff label="본문" before={older.body} after={newer.body} budget={budget} />
                    <Diff label="제품 수치" before={older.facts} after={newer.facts} budget={budget} />
                  </>
                )}
                {!older.redacted && (
                  <details className="revision-full">
                    <summary>이전 판 전체 보기</summary>
                    <h3>{older.title}</h3>
                    <div className="post-body">{older.body}</div>
                  </details>
                )}
                {!older.redacted && !post.is_ai_curated && <RedactRevision postId={post.id} revisionId={r.id} />}
              </li>
            );
          })}
        </ol>
      )}
      {(page > 1 || hasMore) && (
        <nav className="pagination" aria-label="수정 이력 쪽">
          {page > 1 && (
            <Link className="btn btn-sm" href={`/posts/${post.id}/history${page === 2 ? "" : `?page=${page - 1}`}`} rel="prev">
              ← 최근 수정
            </Link>
          )}
          {hasMore && (
            <Link className="btn btn-sm" href={`/posts/${post.id}/history?page=${page + 1}`} rel="next">
              이전 수정 →
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}
