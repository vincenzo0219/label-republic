import { radarAsOf, radarRows, radarVisible, type Radar } from "@/lib/marketRadar";

/** 📡 내일장 레이더 (10/24, 주식 방): 지난밤 숫자만. 평일에 24시간 넘은 숫자는 안 보인다 */
export function RadarCard({ radar, now = new Date() }: { radar: Radar | null; now?: Date }) {
  if (!radar || !radarVisible(radar, now)) return null;
  const rows = radarRows(radar);
  if (rows.length === 0 && !radar.cause) return null;
  return (
    <section className="writing-log market-card" aria-label="내일장 레이더">
      <h2 className="writing-title">
        내일장 레이더 <span className="hint">{radarAsOf(radar.asOf)}</span>
      </h2>
      {rows.length > 0 && (
        <ul className="market-list">
          {rows.map((r) => (
            <li key={r.label}>
              <span className="num">{r.label}</span>
              <span>{r.value}</span>
            </li>
          ))}
        </ul>
      )}
      {radar.cause && (
        <p className="radar-cause">
          <a href={radar.cause.url} target="_blank" rel="noopener nofollow">{radar.cause.text}</a>
        </p>
      )}
      {!!radar.sources?.length && (
        <p className="hint radar-sources">
          {radar.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && " · "}
              <a href={s.url} target="_blank" rel="noopener nofollow">{s.label}</a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
