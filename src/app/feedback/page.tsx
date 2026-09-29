import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { FeedbackForm } from "@/components/FeedbackForm";
import { MetooButton } from "@/components/MetooButton";
import { MyFeedback } from "@/components/MyFeedback";
import { Pagination } from "@/components/Pagination";
import { cleanPath, FEEDBACK_KINDS, FEEDBACK_STATUS, OPEN_STATUSES } from "@/lib/feedback";
import { fingerprint } from "@/lib/fingerprint";
import { timeAgo } from "@/lib/format";
import { listPublic, PAGE_SIZE, type FeedbackFilter } from "@/lib/repo/feedback";

export const dynamic = "force-dynamic";

// 제보 제목을 검색 결과에 올리려는 도배를 부르지 않게 색인하지 않는다
export const metadata: Metadata = {
  title: "고쳐 주세요 · 제안하기",
  description: "노방장의 고장·불편·제안을 알려 주세요. 처리 상태는 모두 공개됩니다.",
  robots: { index: false, follow: true },
};

const FILTERS: { key: FeedbackFilter; label: string }[] = [
  { key: "open", label: "처리 중" },
  { key: "closed", label: "처리됨" },
  { key: "all", label: "전체" },
];

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function FeedbackPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filter: FeedbackFilter = sp.filter === "closed" || sp.filter === "all" ? sp.filter : "open";
  const page = Math.max(1, Number(sp.page) || 1);
  const from = cleanPath(sp.from);
  const fp = fingerprint((await headers()) as unknown as Headers);
  const { items, total } = await listPublic(filter, page, fp);

  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 8px" }}>🛠 고쳐 주세요 · 제안하기</h1>
      <p className="hint">
        사이트가 이상하게 동작하거나 불편한 점, 있었으면 하는 기능을 알려 주세요. 가입 없이 보낼 수 있고, <b>제목·처리 상태·운영자 답변은 이 화면에 공개</b>됩니다. 자세한
        내용은 운영자와 보낸 브라우저에서만 보여요. 같은 문제를 겪었다면 새로 쓰지 말고 아래 목록에서 &ldquo;🙋 나도&rdquo;를 눌러 주세요 — 많이 겪은 문제부터 봅니다.
      </p>

      <FeedbackForm from={from} />
      <MyFeedback />

      <section aria-labelledby="fb-board-h">
        <h2 id="fb-board-h" className="section-h">
          현황판
        </h2>
        <nav className="type-filter" aria-label="제보 상태">
          {FILTERS.map((f) => (
            <Link key={f.key} href={f.key === "open" ? "/feedback" : `/feedback?filter=${f.key}`} aria-current={f.key === filter ? "true" : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>
        {items.length === 0 ? (
          <p className="empty">{filter === "open" ? "처리 중인 제보가 없어요." : "아직 제보가 없어요."}</p>
        ) : (
          <ul className="alias-list">
            {items.map((f) => (
              <li key={f.id} className="alias-item">
                <div className="alias-head">
                  <b>
                    #{f.id} {f.status === "hidden" ? <span className="hint">(운영자가 가린 제보)</span> : f.title}
                  </b>
                  <span className={`badge ${f.status === "done" ? "badge-ai" : "badge-pending"}`}>{FEEDBACK_STATUS[f.status]}</span>
                </div>
                <p className="hint" style={{ margin: 0 }}>
                  {FEEDBACK_KINDS[f.kind]} · <time dateTime={f.created_at}>{timeAgo(f.created_at)}</time>
                  {f.page_path && (
                    <>
                      {" · "}
                      <Link href={f.page_path}>{f.page_path}</Link>
                    </>
                  )}
                  {!OPEN_STATUSES.includes(f.status) && f.metoo_count > 0 && ` · 나도 겪었어요 ${f.metoo_count}`}
                  {f.duplicate_of && (
                    <>
                      {" · 같은 제보 "}
                      <Link href={`/feedback?filter=all#fb-${f.duplicate_of}`}>#{f.duplicate_of}</Link>
                    </>
                  )}
                </p>
                {f.public_note && <p className="fb-note">운영자: {f.public_note}</p>}
                {OPEN_STATUSES.includes(f.status) && <MetooButton id={f.id} count={f.metoo_count} mine={!!f.my_metoo} title={`#${f.id} ${f.title}`} />}
                <span id={`fb-${f.id}`} />
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath="/feedback" params={filter === "open" ? {} : { filter }} page={page} pageSize={PAGE_SIZE} total={total} />
      </section>
    </>
  );
}
