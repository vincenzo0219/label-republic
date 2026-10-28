import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SinglesSeenMark } from "@/components/SinglesBingo";
import { SinglesDetail } from "@/components/SinglesRoom";
import { LiveComments } from "@/components/LiveComments";
import { addSeen } from "@/lib/metrics";
import { listComments } from "@/lib/repo/comments";
import { getSinglesEvent, listSinglesEvents, type StoredSinglesEvent } from "@/lib/repo/singlesEvents";
import { ensureSinglesTalks } from "@/lib/repo/singlesTalk";
import { ORGANIZER_TYPES, SINGLES_PATH, SINGLES_ROOM_NAME, SINGLES_SCOPE_NOTE, birthLabel, periodLabel, todayKst, type SinglesEvent } from "@/lib/singlesEvents";

export const dynamic = "force-dynamic";

const getEvent = cache(async (id: string) => getSinglesEvent(id).catch(() => null));
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await getEvent((await params).id);
  if (!e) return { title: SINGLES_ROOM_NAME, robots: { index: false, follow: true } };
  const description = [ORGANIZER_TYPES[e.organizerType], e.organizer, `모집 ${periodLabel(e.applyStart, e.applyEnd)}`, birthLabel(e)].filter(Boolean).join(" · ");
  return { title: `${e.title} · 만남 행사`, description, alternates: { canonical: `/singles/${e.id}` } };
}

/** 💌 만남 행사 한 건 (/singles/<번호>): 알림·MCP 에서 들어오는 곳. 신청은 원문에서. 댓글은 행사 이야기만 (10/27, 연락처·만남 연결은 막힘) */
export default async function SinglesEventPage({ params }: Props) {
  const e = await getEvent((await params).id);
  if (!e) notFound();
  const today = todayKst();
  const events = await listSinglesEvents({ today }).catch(() => []);
  const strip = ({ hidden: _h, ...rest }: StoredSinglesEvent): SinglesEvent => rest;
  const talk = (await ensureSinglesTalks([e]).catch(() => ({})) as Record<string, { postId: string; views: number }>)[e.id];
  // 상세를 연 것도 본 사람으로 센다 (목록에서 이미 센 브라우저는 목록이 막는다)
  if (talk) addSeen([talk.postId]);
  const comments = talk ? await listComments(talk.postId).catch(() => []) : [];
  return (
    <article className="singles-page">
      {/* 🎯 행사 빙고: 이 행사를 본 것으로 (이 브라우저에만) */}
      <SinglesSeenMark id={e.id} />
      <p className="hint">
        <Link href={SINGLES_PATH}>← {SINGLES_ROOM_NAME}</Link>
      </p>
      <SinglesDetail event={strip(e)} events={events.map(strip)} today={today} />
      <p className="hint singles-scope">{SINGLES_SCOPE_NOTE}</p>
      {talk && (
        <section id="talk" className="singles-talk" aria-label="행사 댓글">
          <h2 className="section-title">💬 이 행사 이야기 <span className="hint" aria-label={`${talk.views}명 봤어요`}>👁 {talk.views.toLocaleString("ko-KR")}</span></h2>
          <p className="hint">신청 꿀팁·질문만. 연락처 교환·만남 연결은 할 수 없어요.</p>
          <LiveComments postId={talk.postId} initial={comments} casual report />
        </section>
      )}
    </article>
  );
}
