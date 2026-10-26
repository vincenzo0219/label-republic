import type { Metadata } from "next";
import Link from "next/link";
import { GigForm } from "@/components/GigForm";
import { JOB_TYPE_KEYS, boardLabelOf, boardPathOf, type GigKind, type JobType } from "@/lib/instructorRoom";

export const metadata: Metadata = { title: "글 올리기", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const TITLES: Record<GigKind, string> = { sub: "대강 올리기", job: "구인·구직 올리기", ask: "1대1 레슨 구해요" };

/** /gigs/new?kind=sub|job|ask[&type=center|…|lesson] — 탭마다 글쓰기 버튼이 여기로 */
export default async function NewGigPage({ searchParams }: Props) {
  const sp = await searchParams;
  const kind: GigKind = sp.kind === "job" || sp.kind === "ask" ? sp.kind : "sub";
  const jobType = kind === "job" && (JOB_TYPE_KEYS as string[]).includes(sp.type ?? "") ? (sp.type as JobType) : null;
  const title = jobType === "lesson" ? "1대1 레슨 가능 올리기" : TITLES[kind];
  return (
    <div className="gig-page">
      <p className="hint"><Link href={boardPathOf(kind)}>← {boardLabelOf(kind)}</Link></p>
      <h1 className="gig-h1">{title}</h1>
      <GigForm key={`${kind}:${jobType ?? ""}`} kind={kind} jobType={jobType} />
    </div>
  );
}
