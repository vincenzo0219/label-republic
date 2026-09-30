import Link from "next/link";
import { FeedbackActions } from "@/components/admin/FeedbackActions";
import { FEEDBACK_KINDS, FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/feedback";
import { listForAdmin } from "@/lib/repo/feedback";

export const dynamic = "force-dynamic";

const FILTERS: (FeedbackStatus | "open" | "all")[] = ["open", "new", "done", "wontfix", "duplicate", "hidden", "all"];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = (FILTERS as string[]).includes(sp.status ?? "") ? (sp.status as FeedbackStatus | "open" | "all") : "open";
  const items = await listForAdmin(status);
  return (
    <div className="admin">
      <header className="admin-head">
        <h1>제보</h1>
        <p className="hint">
          <Link href="/admin">← 운영 대시보드</Link> · 제목·상태·<b>공개 답변은 <Link href="/feedback">현황판</Link>에 그대로 보입니다</b>. 자세한 내용·기기 정보는 운영자만
          봅니다. 광고·욕설·개인정보는 &ldquo;가림&rdquo;(사유 필수, 가렸다는 사실과 사유는 공개), 고치지 않을 것은 &ldquo;그대로 둠&rdquo;(이유 필수).
        </p>
        <nav className="type-filter" aria-label="상태">
          {FILTERS.map((f) => (
            <Link key={f} href={f === "open" ? "/admin/feedback" : `/admin/feedback?status=${f}`} aria-current={f === status ? "true" : undefined}>
              {f === "open" ? "처리 중" : f === "all" ? "전체" : FEEDBACK_STATUS[f]}
            </Link>
          ))}
        </nav>
      </header>
      {items.length === 0 ? (
        <p className="empty">제보가 없습니다.</p>
      ) : (
        <ul className="mod-list">
          {items.map((f) => (
            <li key={f.id}>
              <div className="mod-row">
                <span>
                  <b>
                    #{f.id} {f.real_title}
                  </b>{" "}
                  <span className="hint">
                    {FEEDBACK_KINDS[f.kind]} · {FEEDBACK_STATUS[f.status]} · 나도 {f.metoo_count}
                    {f.duplicate_of && ` · 같은 제보 #${f.duplicate_of}`}
                  </span>
                </span>
                <span className="hint">{fmt(f.created_at)}</span>
              </div>
              <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{f.body || <span className="hint">(보관 기간이 지나 지워짐)</span>}</p>
              <p className="hint" style={{ margin: "4px 0" }}>
                {f.page_path ? <Link href={f.page_path}>{f.page_path}</Link> : "보던 화면 없음"}
                {Object.keys(f.env ?? {}).length > 0 &&
                  ` · ${[f.env.browser, f.env.os, f.env.viewport && `화면 ${f.env.viewport}`, f.env.standalone && "홈 화면 앱", f.env.online === false && "오프라인", f.env.app && `빌드 ${f.env.app}`]
                    .filter(Boolean)
                    .join(" · ")}`}
              </p>
              <FeedbackActions id={f.id} status={f.status} note={f.public_note} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
