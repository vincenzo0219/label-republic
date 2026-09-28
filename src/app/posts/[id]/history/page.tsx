import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { diffLines, foldDiff } from "@/lib/diff";
import { FACT_KIND_LABEL, formatValue } from "@/lib/products";
import { listCorrections } from "@/lib/repo/corrections";
import { getPost, listRevisions } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "수정 이력", robots: { index: false, follow: true } };

type Props = { params: Promise<{ id: string }> };

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type FactLike = { product?: string; attribute: string; value: number; unit: string; basis: string; kind: "label" | "measured" };
const factLine = (f: FactLike) => `${f.product ? `${f.product} · ` : ""}${f.attribute} ${formatValue(f.value)} ${f.unit}${f.basis ? ` (${f.basis})` : ""} · ${FACT_KIND_LABEL[f.kind]}`;

function Diff({ before, after, label }: { before: string; after: string; label: string }) {
  if (before === after) return null;
  const lines = diffLines(before, after);
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
        <p className="hint">변경이 너무 커서 줄 비교를 생략했습니다.</p>
      )}
    </div>
  );
}

export default async function HistoryPage({ params }: Props) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post || post.is_blinded) notFound();
  const [revisions, corrections] = await Promise.all([listRevisions(id), listCorrections(id)]);
  const names = new Map(post.products.map((p) => [p.id, `${p.brand} ${p.name}`]));
  const current = {
    title: post.title,
    body: post.body,
    facts: post.facts.map((f) => factLine({ ...f, product: names.get(f.product_id) })).join("\n"),
    at: post.updated_at,
  };
  // 최신 → 과거: 각 판을 바로 다음(더 새) 판과 비교
  const versions = [current, ...revisions.map((r) => ({ title: r.title, body: r.body, facts: r.facts.map(factLine).join("\n"), at: r.created_at }))];
  const applied = corrections.items.filter((c) => c.status === "applied");

  return (
    <article className="history">
      <p className="hint">
        <Link href={`/posts/${post.id}`}>← 글로 돌아가기</Link>
      </p>
      <h1 style={{ fontSize: 20, margin: "4px 0 4px" }}>수정 이력</h1>
      <p className="hint">{post.title} · 수정 {revisions.length}회. 누구나 무엇이 바뀌었는지 볼 수 있습니다.</p>

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
                <Diff label="제목" before={older.title} after={newer.title} />
                <Diff label="본문" before={older.body} after={newer.body} />
                <Diff label="제품 수치" before={older.facts} after={newer.facts} />
                <details className="revision-full">
                  <summary>이전 판 전체 보기</summary>
                  <h3>{older.title}</h3>
                  <div className="post-body">{older.body}</div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}
