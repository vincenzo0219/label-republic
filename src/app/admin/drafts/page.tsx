import Link from "next/link";
import { DraftCard } from "@/components/admin/DraftCard";
import { DRAFT_KINDS, listDrafts, type Draft } from "@/lib/repo/drafts";

export const dynamic = "force-dynamic";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function where(d: Draft) {
  if (d.kind === "comment" && d.post_id) return <Link href={`/posts/${d.post_id}#comments`}>#{d.post_id} {d.post_title ?? ""}</Link>;
  if (d.kind === "post") return <span>{d.category_slug} 방 · 잡담</span>;
  return null;
}

const DONE_LABEL = { posted: "올림", copied: "올렸음", discarded: "버림", pending: "대기" } as const;

export default async function AdminDraftsPage() {
  const { pending, done } = await listDrafts();
  return (
    <div className="admin">
      <header className="admin-head">
        <h1>📝 승인 대기함</h1>
        <p className="hint">
          <Link href="/admin">← 운영 대시보드</Link> · AI가 만든 운영자 글·답글과 스레드·인스타 문구입니다. 고쳐서 <b>승인</b>해야만 올라가고, 승인한 글은 운영자 본인의 글로 보입니다.
          써 보지 않은 제품의 후기처럼 보이는 문장은 고치거나 버려 주세요.
        </p>
      </header>
      {pending.length === 0 ? (
        <p className="empty">대기 중인 초안이 없어요. 매일 15:47 점검 때 새 초안이 들어옵니다.</p>
      ) : (
        <ul className="mod-list">
          {pending.map((d) => (
            <li key={d.id}>
              <div className="mod-row">
                <span>
                  <b>
                    {DRAFT_KINDS[d.kind]} #{d.id}
                  </b>{" "}
                  <span className="hint">
                    {d.kind === "post" || d.kind === "comment" ? <>{d.nickname} · {where(d)}</> : "노방장 공식 계정"}
                  </span>
                </span>
                <span className="hint">{fmt(d.created_at)}</span>
              </div>
              {d.note && <p className="hint" style={{ margin: "4px 0" }}>💡 {d.note}</p>}
              <DraftCard id={d.id} kind={d.kind} title={d.title} body={d.body} extra={d.extra} />
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section>
          <h2 style={{ fontSize: 16 }}>최근 처리</h2>
          <ul className="mod-list">
            {done.map((d) => (
              <li key={d.id}>
                <div className="mod-row">
                  <span>
                    {DRAFT_KINDS[d.kind]} #{d.id} · {DONE_LABEL[d.status]}{" "}
                    {d.result_post_id && (
                      <Link href={`/posts/${d.result_post_id}${d.result_comment_id ? "#comments" : ""}`}>{d.kind === "post" ? d.title : `#${d.result_post_id} 답글`}</Link>
                    )}
                    {!d.result_post_id && <span className="hint">{(d.title || d.body).slice(0, 40)}</span>}
                  </span>
                  <span className="hint">{d.decided_at ? fmt(d.decided_at) : ""}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
