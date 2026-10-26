import Link from "next/link";
import {
  ORGANIZER_TYPES,
  SINGLES_NOTICE,
  STATUS_LABELS,
  VERDICT_LABELS,
  applyDdayLabel,
  birthLabel,
  eventStatus,
  periodLabel,
  quotaLabel,
  regionRuleLabel,
  singlesEventPath,
  type Eligibility,
  type SinglesEvent,
} from "@/lib/singlesEvents";

/**
 * 💌 만남 행사 카드: 주최 구분 · 모집 기간 + D-day · 요건 · 원문 링크(필수) · 수집일 · "최종 기준은 원문 공지".
 * 사람을 잇는 버튼(갈 거예요·같이 가요·댓글)은 없다.
 */
export function SinglesEventCard({
  event: e,
  today,
  eligibility,
  link = true,
  children,
}: {
  event: SinglesEvent;
  today: string;
  eligibility?: Eligibility | null;
  /** 제목을 상세로 잇는다 (상세 화면에서는 끈다) */
  link?: boolean;
  children?: React.ReactNode;
}) {
  const st = eventStatus(e, today);
  const where = [e.sido, e.sigungu, e.venue].filter(Boolean).join(" ");
  const rules = [birthLabel(e), quotaLabel(e), regionRuleLabel(e), e.firstMarriageOnly ? "초혼만" : ""].filter(Boolean);
  const extra = [e.fee === null ? "" : e.fee === 0 ? "참가비 무료" : `참가비 ${e.fee.toLocaleString("ko-KR")}원`, e.selection].filter(Boolean);
  return (
    <article className={`singles-card st-${st}`}>
      <div className="singles-top">
        <span className={`singles-org org-${e.organizerType}`}>{ORGANIZER_TYPES[e.organizerType]}</span>
        <span className={`singles-dday st-${st}`}>{applyDdayLabel(e, today)}</span>
        {eligibility && (
          <span className={`singles-verdict v-${eligibility.verdict}`} title={eligibility.reasons.join(" · ")}>
            {VERDICT_LABELS[eligibility.verdict]}
          </span>
        )}
      </div>
      <h3 className="singles-title">{link ? <Link href={singlesEventPath(e.id)}>{e.title}</Link> : e.title}</h3>
      <dl className="singles-facts">
        <dt>주최</dt>
        <dd>{e.organizer}</dd>
        <dt>모집</dt>
        <dd>
          {periodLabel(e.applyStart, e.applyEnd)} <span className="hint">({STATUS_LABELS[st]})</span>
        </dd>
        {(e.eventDate || e.eventEnd) && (
          <>
            <dt>행사</dt>
            <dd>{periodLabel(e.eventDate, e.eventEnd ?? e.eventDate)}</dd>
          </>
        )}
        {where && (
          <>
            <dt>장소</dt>
            <dd>{where}</dd>
          </>
        )}
        {rules.length > 0 && (
          <>
            <dt>요건</dt>
            <dd>{rules.join(" · ")}</dd>
          </>
        )}
        {extra.length > 0 && (
          <>
            <dt>방식</dt>
            <dd>{extra.join(" · ")}</dd>
          </>
        )}
        {e.competitionNote && (
          <>
            <dt>지난 회차</dt>
            <dd>{e.competitionNote}</dd>
          </>
        )}
        {e.notes && (
          <>
            <dt>참고</dt>
            <dd>{e.notes}</dd>
          </>
        )}
      </dl>
      {eligibility && eligibility.verdict !== "ok" && <p className={`singles-why v-${eligibility.verdict}`}>{eligibility.reasons.join(" · ")}</p>}
      <p className="singles-source">
        <a href={e.originalUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-sm">
          원문 공지 보기
        </a>
        <span className="hint">수집일 {e.collectedAt}</span>
      </p>
      <p className="hint singles-notice">{SINGLES_NOTICE}</p>
      {children}
    </article>
  );
}
