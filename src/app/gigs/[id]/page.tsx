import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { GigActions } from "@/components/GigActions";
import { GigOff } from "@/components/GigBoard";
import { BOARD_PATH, GIG_KINDS, mdLabel, payLabel, regionLabel, weekdayLabel, whenLabel } from "@/lib/instructorRoom";
import { getGig as getGigUncached } from "@/lib/repo/gigs";

export const dynamic = "force-dynamic";

const getGig = cache(async (id: string) => getGigUncached(id).catch(() => null));

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

// 연락처는 HTML 에 없다(버튼으로 받아 옴). 그래도 글 화면은 검색에 남기지 않는다 — 날짜가 지나면 의미 없는 글이라
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await getGig((await params).id);
  if (!g || g.hidden) return { title: "대강·구인", robots: { index: false, follow: false } };
  return {
    title: `${g.kind === "sub" ? "대강" : "정규 구인"} · ${regionLabel(g.sido, g.sigungu)} · ${g.classType}`,
    description: [whenLabel(g), g.classType, payLabel(g.pay)].filter(Boolean).join(" · "),
    robots: { index: false, follow: false, nocache: true },
  };
}

/** 📋 대강·구인 글 (/gigs/<번호>): 알림·목록에서 들어오는 곳. 연락처는 버튼을 눌러야 */
export default async function GigPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const g = await getGig(id);
  if (!g || g.hidden)
    return (
      <div className="gig-page">
        <h1 className="sr-only">대강·구인</h1>
        <p className="empty">글을 찾을 수 없어요</p>
        <p><Link href={BOARD_PATH} className="kids-line">📋 대강·구인 게시판</Link></p>
      </div>
    );
  const done = g.closed || g.expired;
  const rows: [string, string][] = [
    ["지역", [regionLabel(g.sido, g.sigungu), g.station && `${g.station}역`].filter(Boolean).join(" · ")],
    ["주소", g.address],
    [g.kind === "sub" ? "날짜" : "요일", g.kind === "sub" ? g.dates.map(mdLabel).join(", ") : [g.weekdays.length ? `매주 ${weekdayLabel(g.weekdays)}` : "", g.dates[0] ? `${mdLabel(g.dates[0])}부터` : ""].filter(Boolean).join(" · ")],
    ["시간", g.times.join(", ")],
    ["수업", [g.classType, g.equipment.join("·")].filter(Boolean).join(" · ")],
    ["페이", g.pay ? `타임당 ${g.pay.toLocaleString("ko-KR")}원` : "협의"],
    ["공제", g.tax === true ? "3.3% 공제" : g.tax === false ? "공제 없음" : ""],
    ["입금", g.payday],
  ];
  return (
    <article className="gig-page kids-page">
      <p className="hint"><Link href={BOARD_PATH}>← 📋 대강·구인</Link></p>
      {sp.u && <GigOff token={sp.u.slice(0, 60)} />}
      <header className="post-head">
        <div className="kids-chips">
          {done ? <span className="kids-chip st-closed">마감</span> : g.urgent ? <span className="kids-chip st-open">🔥 오늘 급구</span> : <span className="kids-chip kind">{GIG_KINDS[g.kind]}</span>}
          <span className="kids-chip">{g.classType}</span>
          {g.pay ? <span className="kids-chip free">{payLabel(g.pay)}</span> : null}
        </div>
        <h1>{g.studio || `${regionLabel(g.sido, g.sigungu)} ${g.classType}`}</h1>
        <p className="kids-where">{g.nickname} · {new Date(g.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
      </header>
      <dl className="kids-facts gig-facts">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {g.notes && <p className="gig-notes">{g.notes}</p>}
      <GigActions id={g.id} done={done} />
    </article>
  );
}
