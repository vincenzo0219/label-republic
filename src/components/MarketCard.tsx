import { kstDate, kstTime, splitEvents, type MarketEvent } from "@/lib/marketEvents";

function Row({ e, withDate = false }: { e: MarketEvent; withDate?: boolean }) {
  const title = e.market === "kr" ? `🇰🇷 ${e.title}` : e.title;
  return (
    <li>
      <span className="num">{withDate ? `${kstDate(e.starts_at)} ` : ""}{kstTime(e.starts_at)}</span>
      {e.source_url ? (
        <a href={e.source_url} target="_blank" rel="noopener nofollow">{title}</a>
      ) : (
        <span>{title}</span>
      )}
    </li>
  );
}

/** 📅 오늘 밤 미국장 (10/24): KST 오늘 밤 일정 + 접힌 다음 7일. 시세·의견 없음 */
export function MarketCard({ events, now = new Date() }: { events: MarketEvent[]; now?: Date }) {
  const { tonight, week } = splitEvents(events, now);
  return (
    <section className="writing-log market-card" aria-label="오늘 밤 미국장">
      <h2 className="writing-title">오늘 밤 미국장</h2>
      {tonight.length === 0 ? <p className="hint">일정 없음</p> : <ul className="market-list">{tonight.map((e) => <Row key={e.id} e={e} />)}</ul>}
      {week.length > 0 && (
        <details>
          <summary className="hint">다음 주 일정 {week.length}</summary>
          <ul className="market-list">{week.map((e) => <Row key={e.id} e={e} withDate />)}</ul>
        </details>
      )}
    </section>
  );
}
