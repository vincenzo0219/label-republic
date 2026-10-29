import type { Metadata } from "next";
import { viewerFp } from "@/lib/viewerFp";
import Link from "next/link";
import { cache } from "react";
import { KidsAlertButton } from "@/components/KidsAlertButton";
import { KidsComments } from "@/components/KidsComments";
import { KidsOutLink } from "@/components/KidsOutLink";
import { applyHref, KIDS_ROOM, KIDS_TAB, kstShort, programStatus } from "@/lib/kidsPrograms";
import { badgesSafe } from "@/lib/repo/badges";
import { listComments } from "@/lib/repo/comments";
import { getProgram as getProgramUncached, programPostId } from "@/lib/repo/kidsPrograms";

export const dynamic = "force-dynamic";

const getProgram = cache(async (id: string) => getProgramUncached(id).catch(() => null));
const TAB = `/c/${encodeURIComponent(KIDS_ROOM)}?tab=${KIDS_TAB}`;

type Props = { params: Promise<{ id: string }> };

const decode = (raw: string) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decode((await params).id);
  const p = await getProgram(id);
  if (!p) return { title: "동네 체험", robots: { index: false, follow: true } };
  const description = [p.dateText, p.place, p.age, p.free ? "무료" : p.cost].filter(Boolean).join(" · ");
  return { title: `${p.name} · 동네 체험`, description, alternates: { canonical: `/kids/${encodeURIComponent(p.id)}` } };
}

/** 📍 동네 체험 프로그램 페이지 (/kids/<아이볼 id>): 알림·아이볼에서 들어오는 곳. 아래는 부모들 댓글 */
export default async function KidsProgramPage({ params }: Props) {
  const id = decode((await params).id);
  const p = await getProgram(id);
  if (!p)
    return (
      <div className="kids-page">
        <h1 className="sr-only">동네 체험</h1>
        <p className="empty">프로그램 정보를 찾을 수 없어요</p>
        <p><Link href={TAB} className="kids-line">📍 육아방 동네 체험</Link></p>
      </div>
    );
  const postId = await programPostId(p.id).catch(() => null);
  const comments = postId ? await listComments(postId, await viewerFp()) : [];
  const badges = postId ? await badgesSafe(KIDS_ROOM, comments.map((c) => c.nickname)) : undefined;
  const status = programStatus(p);
  const apply = applyHref(p);
  const rows: [string, string][] = [
    ["날짜", p.dateText],
    ["장소", [p.place, p.city].filter(Boolean).join(" · ")],
    ["대상", p.age],
    ["비용", p.free ? "무료" : p.cost],
    ["신청", p.applyStartAt ? `${kstShort(p.applyStartAt)}${p.applyEndAt ? ` ~ ${kstShort(p.applyEndAt)}` : ""}` : p.applyEndAt ? `~ ${kstShort(p.applyEndAt)}` : ""],
  ];
  return (
    <article className="kids-page">
      <p className="hint"><Link href={TAB}>← 📍 동네 체험</Link></p>
      <header className="post-head">
        <div className="kids-chips">
          {p.kind && <span className="kids-chip kind">{p.kind}</span>}
          {p.free && <span className="kids-chip free">무료</span>}
          {status && <span className={`kids-chip st-${status.key}`}>{status.label}</span>}
        </div>
        <h1>{p.name}</h1>
        {p.institution && <p className="kids-where">{p.institution}</p>}
      </header>
      <dl className="kids-facts">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="kids-cta">
        {apply && status?.key !== "closed" && <KidsOutLink program={p} kind={p.applyUrl ? "apply" : "ibol"} className="btn btn-primary">신청하기 →</KidsOutLink>}
        <KidsAlertButton program={p} bellOnly />
      </div>
      {p.ibolUrl && <p className="kids-ibol"><KidsOutLink program={p} kind="ibol">아이볼에서 보기</KidsOutLink></p>}
      <p className="kids-source">출처: {p.source || p.institution || "기관 안내"} · 아이볼 정리</p>
      <KidsComments programId={p.id} postId={postId} initial={comments} badges={badges} />
    </article>
  );
}
