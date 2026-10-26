import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { GigActions } from "@/components/GigActions";
import { GigCardView, GigOff, LessonNotice } from "@/components/GigBoard";
import { ReportButton } from "@/components/ReportButton";
import {
  CONTRACTS,
  GIG_KINDS,
  GOALS,
  JOB_TYPES,
  LEVELS,
  PLACES,
  areasLabel,
  boardLabelOf,
  boardPathOf,
  isLessonPost,
  jobPayLabel,
  mdLabel,
  payLabel,
  regionLabel,
  weekdayLabel,
  whenLabel,
} from "@/lib/instructorRoom";
import { GIG_BLIND_AT, getGig as getGigUncached, lessonMatchesFor, type GigDetail } from "@/lib/repo/gigs";

export const dynamic = "force-dynamic";

const getGig = cache(async (id: string) => getGigUncached(id).catch(() => null));

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

const kindLabel = (g: Pick<GigDetail, "kind" | "jobType">) => (g.kind === "job" && g.jobType ? JOB_TYPES[g.jobType] : GIG_KINDS[g.kind]);
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

// 연락처는 HTML 에 없다(버튼으로 받아 옴). 그래도 글 화면은 검색에 남기지 않는다 — 날짜가 지나면 의미 없는 글이라
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await getGig((await params).id);
  if (!g || g.hidden) return { title: "대강·구인구직", robots: { index: false, follow: false } };
  const where = isLessonPost(g) ? areasLabel(g.areas) : regionLabel(g.sido, g.sigungu);
  return {
    title: `${kindLabel(g)} · ${where} · ${g.classType}`,
    description: [g.kind === "sub" ? whenLabel(g) : weekdayLabel(g.weekdays), g.classType, g.kind === "sub" ? payLabel(g.pay) : jobPayLabel(g)].filter(Boolean).join(" · "),
    robots: { index: false, follow: false, nocache: true },
  };
}

function factsOf(g: GigDetail): [string, string][] {
  const schedule = [g.weekdays.length ? `매주 ${weekdayLabel(g.weekdays)}` : "", g.timeBands.join("·")].filter(Boolean).join(" · ");
  if (g.kind === "sub")
    return [
      ["지역", [regionLabel(g.sido, g.sigungu), g.station && `${g.station}역`].filter(Boolean).join(" · ")],
      ["주소", g.address],
      ["날짜", g.dates.map(mdLabel).join(", ")],
      ["시간", g.times.join(", ")],
      ["수업", [g.classType, g.equipment.join("·")].filter(Boolean).join(" · ")],
      ["페이", g.pay ? `타임당 ${won(g.pay)}` : "협의"],
      ["공제", g.tax === true ? "3.3% 공제" : g.tax === false ? "공제 없음" : ""],
      ["입금", g.payday],
    ];
  if (g.kind === "ask")
    return [
      ["지역", g.areas.join(", ")],
      ["요일", schedule],
      ["수업", g.classType === "기타" ? "상관없음" : g.classType],
      ["목표", g.goal ? GOALS[g.goal] : ""],
      ["경험", g.level ? LEVELS[g.level] : ""],
      ["희망 금액", g.pay ? `회당 ${won(g.pay)}${g.payMax && g.payMax > g.pay ? ` ~ ${won(g.payMax)}` : ""}` : "협의"],
    ];
  if (g.jobType === "lesson")
    return [
      ["지역", g.areas.join(", ")],
      ["요일", schedule],
      ["수업", [g.classType, g.equipment.join("·")].filter(Boolean).join(" · ")],
      ["금액", g.pay ? `회당 ${won(g.pay)}${g.payMax && g.payMax > g.pay ? ` ~ ${won(g.payMax)}` : ""}` : "협의"],
      ["장소", g.places.map((p) => PLACES[p]).join(" · ")],
      ["자격·경력", g.career],
    ];
  const seek = g.jobType === "seek";
  return [
    ["구분", kindLabel(g)],
    [seek ? "희망 지역" : "지역", [regionLabel(g.sido, g.sigungu), g.station && `${g.station}역`].filter(Boolean).join(" · ")],
    ["주소", g.address],
    ["요일", schedule],
    ["시간", g.times.join(", ")],
    ["수업", [g.classType, g.equipment.join("·")].filter(Boolean).join(" · ")],
    [seek ? "희망 급여" : "급여", [g.pay ? `회당 ${won(g.pay)}` : "", g.payBase ? `기본급 월 ${won(g.payBase)}` : ""].filter(Boolean).join(" · ") || "협의"],
    ["인원 차등", g.payTiers],
    ["노쇼·폐강", g.noshowPay],
    ["계약", g.contract ? CONTRACTS[g.contract] : ""],
    [seek ? "경력" : "경력 요건", [g.career, g.beginnerOk ? "초보 가능" : ""].filter(Boolean).join(" · ")],
    ["시작", [g.dates[0] ? `${mdLabel(g.dates[0])}부터` : "", g.period].filter(Boolean).join(" · ")],
    ["면접·시강", g.screening.join(" · ")],
  ];
}

/** 대강 · 구인구직 · 레슨 글 (/gigs/<번호>): 알림·목록에서 들어오는 곳. 연락처는 버튼을 눌러야 */
export default async function GigPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const g = await getGig(id);
  if (!g || g.hidden)
    return (
      <div className="gig-page">
        <h1 className="sr-only">대강·구인구직</h1>
        <p className="empty">글을 찾을 수 없어요</p>
        <p><Link href={boardPathOf(g?.kind ?? "sub")} className="kids-line">{boardLabelOf(g?.kind ?? "sub")} 게시판</Link></p>
      </div>
    );
  const done = g.closed || g.expired;
  const lesson = isLessonPost(g);
  const matches = lesson && !done ? await lessonMatchesFor(g).catch(() => []) : [];
  const where = lesson ? areasLabel(g.areas) : regionLabel(g.sido, g.sigungu);
  const heading = g.studio || (g.kind === "ask" ? `${where} 1대1 레슨 구해요` : g.jobType === "lesson" ? `${where} 1대1 레슨` : g.jobType === "seek" ? `${where} ${g.classType} 구직` : `${where} ${g.classType}`);
  return (
    <article className="gig-page kids-page">
      <p className="hint"><Link href={boardPathOf(g.kind)}>← {boardLabelOf(g.kind)}</Link></p>
      {sp.u && <GigOff token={sp.u.slice(0, 60)} />}
      <header className="post-head">
        <div className="kids-chips">
          {done ? <span className="kids-chip st-closed">마감</span> : g.urgent ? <span className="kids-chip st-open">🔥 오늘 급구</span> : <span className="kids-chip kind">{kindLabel(g)}</span>}
          <span className="kids-chip">{g.kind === "ask" && g.classType === "기타" ? "수업 상관없음" : g.classType}</span>
          {g.kind === "sub" ? g.pay ? <span className="kids-chip free">{payLabel(g.pay)}</span> : null : <span className="kids-chip free">{jobPayLabel(g)}</span>}
          {g.beginnerOk && <span className="kids-chip st-open">초보 가능</span>}
        </div>
        <h1>{heading}</h1>
        <p className="kids-where">{g.nickname} · {new Date(g.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
      </header>
      {lesson && <LessonNotice />}
      <dl className="kids-facts gig-facts">
        {factsOf(g).filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {g.notes && <p className="gig-notes">{g.notes}</p>}
      <GigActions id={g.id} done={done} />
      <p className="gig-report">
        <ReportButton postId={g.id} blindAt={GIG_BLIND_AT} path={`/api/gigs/${g.id}/report`} hint="광고, 허위 글, 선입금 요구, 욕설 등" />
      </p>
      {lesson && !done && (
        <section className="gig-matches" aria-labelledby="gig-matches-h">
          <h2 id="gig-matches-h" className="section-h">{g.kind === "ask" ? "이 지역·시간대에 레슨 가능한 강사" : "이 지역·시간대에 레슨 구하는 분"}</h2>
          {matches.length ? (
            <div className="kids-grid">
              {matches.map((m) => <GigCardView key={m.id} g={m} />)}
            </div>
          ) : (
            <p className="empty">{g.kind === "ask" ? "아직 맞는 강사 글이 없어요. 새 글이 올라오면 여기에 보여요" : "아직 맞는 글이 없어요. 새 글이 올라오면 여기에 보여요"}</p>
          )}
        </section>
      )}
    </article>
  );
}
