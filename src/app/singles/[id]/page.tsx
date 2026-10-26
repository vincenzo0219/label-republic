import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SinglesDetail } from "@/components/SinglesRoom";
import { getSinglesEvent, listSinglesEvents, type StoredSinglesEvent } from "@/lib/repo/singlesEvents";
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

/** 💌 만남 행사 한 건 (/singles/<번호>): 알림·MCP 에서 들어오는 곳. 댓글·동행 기능 없음, 신청은 원문에서 */
export default async function SinglesEventPage({ params }: Props) {
  const e = await getEvent((await params).id);
  if (!e) notFound();
  const today = todayKst();
  const events = await listSinglesEvents({ today }).catch(() => []);
  const strip = ({ hidden: _h, ...rest }: StoredSinglesEvent): SinglesEvent => rest;
  return (
    <article className="singles-page">
      <p className="hint">
        <Link href={SINGLES_PATH}>← {SINGLES_ROOM_NAME}</Link>
      </p>
      <SinglesDetail event={strip(e)} events={events.map(strip)} today={today} />
      <p className="hint singles-scope">{SINGLES_SCOPE_NOTE}</p>
    </article>
  );
}
