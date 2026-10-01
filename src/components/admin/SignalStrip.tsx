import Link from "next/link";
import { METRIC_DEFS, overallVerdict, pct, SIGNAL_ICON, SIGNAL_LABEL, signedPct, type BusinessMetrics, type MetricKey } from "@/lib/business";

/** /admin 맨 위 한 줄 — 사업 지표 신호등 (Sprint 40) */
export function SignalStrip({ m }: { m: BusinessMetrics }) {
  const verdict = overallVerdict(m.values);
  return (
    <section className="signal-strip" aria-labelledby="signal-h">
      <div className="signal-head">
        <h2 id="signal-h">
          {SIGNAL_ICON[verdict.signal]} 사업 건강 신호등 <span className="sr-only">{SIGNAL_LABEL[verdict.signal]}</span>
        </h2>
        <Link className="btn btn-sm" href="/admin/business">
          📈 사업 지표 자세히
        </Link>
      </div>
      <p className="hint">{verdict.text}</p>
      <ul className="signal-list">
        {(Object.keys(METRIC_DEFS) as MetricKey[]).map((k) => {
          const v = m.values[k];
          return (
            <li key={k} title={METRIC_DEFS[k].what}>
              <span aria-hidden>{SIGNAL_ICON[v.signal]}</span> {METRIC_DEFS[k].label}{" "}
              <b>{k === "growth" ? signedPct(v.value) : pct(v.value)}</b>
              <span className="sr-only"> ({SIGNAL_LABEL[v.signal]})</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
