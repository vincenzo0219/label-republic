/**
 * 운영 대시보드용 서버 렌더링 차트 (차트 라이브러리·클라이언트 JS 없음)
 * - 측정값마다 단일 시리즈 차트 하나 (이중 축 없음) → 범례 대신 제목이 시리즈를 명명
 * - 막대 hover 시 강조 + 네이티브 툴팁(title), 히트 영역은 막대보다 넓은 전체 열
 * - 모든 차트에 "표로 보기" 대안 제공
 */

export function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString("ko-KR");
}

function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// ---------------------------------------------------------------------------
// Stat tile: label · value · delta(직전 기간 대비) · 14일 sparkline(직전 7일 흐림, 최근 7일 강조)
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  previous,
  format = compact,
  trend,
  hint,
}: {
  label: string;
  value: number;
  previous?: number;
  format?: (n: number) => string;
  trend?: number[];
  hint?: string;
}) {
  let delta: { text: string; dir: "up" | "down" | "flat" } | null = null;
  if (previous !== undefined) {
    if (previous === 0) delta = value === 0 ? { text: "변화 없음", dir: "flat" } : { text: "신규", dir: "up" };
    else {
      const pct = ((value - previous) / previous) * 100;
      const dir = Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
      delta = { text: `${pct > 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`, dir };
    }
  }
  return (
    <div className="stat-tile" title={hint}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{format(value)}</div>
      {delta && (
        <div className={`stat-delta ${delta.dir}`}>
          <span aria-hidden>{delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "–"}</span> {delta.text}
          <span className="stat-period"> 직전 7일 대비</span>
        </div>
      )}
      {trend && trend.length > 1 && <Sparkline values={trend} />}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 100;
  const h = 24;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - (v / max) * (h - 4)] as const);
  const split = Math.max(0, values.length - 7);
  const toStr = (arr: readonly (readonly [number, number])[]) => arr.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={toStr(pts.slice(0, split + 1))} className="spark-prev" vectorEffect="non-scaling-stroke" />
      <polyline points={toStr(pts.slice(split))} className="spark-cur" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 일별 막대 차트 (단일 시리즈)
// ---------------------------------------------------------------------------

export function DailyBars({ title, unit, data, description }: { title: string; unit: string; data: { day: string; value: number }[]; description?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const mid = Math.floor((data.length - 1) / 2);
  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-sub">
          최근 {data.length}일 합계 {compact(total)}
          {unit}
        </span>
      </figcaption>
      {description && <p className="chart-desc">{description}</p>}
      <div className="bars" role="img" aria-label={`${title}, 최근 ${data.length}일, 최대 ${max}${unit}`}>
        <div className="bars-axis" aria-hidden>
          <span>{compact(max)}</span>
          <span>0</span>
        </div>
        <div className="bars-plot">
          <div className="bars-grid" aria-hidden />
          {data.map((d) => (
            <div key={d.day} className="bar-col" title={`${d.day} · ${d.value.toLocaleString("ko-KR")}${unit}`}>
              <div className="bar" style={{ height: d.value ? `max(${(d.value / max) * 100}%, 2px)` : 0 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="bars-x" aria-hidden>
        <span>{data[0] ? shortDay(data[0].day) : ""}</span>
        <span>{data[mid] ? shortDay(data[mid].day) : ""}</span>
        <span>{data.at(-1) ? shortDay(data.at(-1)!.day) : ""}</span>
      </div>
      <details className="table-view">
        <summary>표로 보기</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th className="num">{title}</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td className="num">{d.value.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 가로 막대 목록 (크기 비교, 단일 색 + 직접 라벨)
// ---------------------------------------------------------------------------

export function HBarList({ title, rows, unit, empty }: { title: string; rows: { label: string; value: number }[]; unit: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-sub">
          합계 {compact(total)}
          {unit}
        </span>
      </figcaption>
      {rows.length === 0 ? (
        <p className="chart-empty">{empty}</p>
      ) : (
        <ul className="hbars">
          {rows.map((r) => (
            <li key={r.label} title={`${r.label} · ${r.value.toLocaleString("ko-KR")}${unit}`}>
              <span className="hbar-label">{r.label}</span>
              <span className="hbar-track">
                <span className="hbar" style={{ width: `max(${(r.value / max) * 100}%, 2px)` }} />
              </span>
              <span className="hbar-value">
                {r.value.toLocaleString("ko-KR")}
                <small> {total ? Math.round((r.value / total) * 100) : 0}%</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 상태 표시: 색 + 아이콘 + 라벨 (색만으로 의미를 전달하지 않음)
// ---------------------------------------------------------------------------

export function StatusPill({ status }: { status: "good" | "warning" | "serious" | "critical" }) {
  const map = {
    good: ["✓", "정상"],
    warning: ["⚠", "주의"],
    serious: ["⛔", "심각"],
    critical: ["✕", "오류"],
  } as const;
  const [icon, label] = map[status];
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" aria-hidden />
      <span aria-hidden>{icon}</span> {label}
    </span>
  );
}
