import { ratioToPercent, valueToSparkY } from "../hooks/useChartMathPresentation";
import { formatSignedRiskPoints } from "../hooks/useRiskLevelPresentation";

export function ScoreBar({ label, pts, max, color }) {
  const pct = ratioToPercent(pts, max);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: "var(--text-muted)" }}>{label}</span>
        <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{pts} / {max}</span>
      </div>
      <div style={{ background: "var(--border)", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

export function FactorPill({ f }) {
  const neg = f.pts < 0;
  const sev = neg ? "low" : f.pts >= 12 ? "crit" : f.pts >= 6 ? "high" : "med";
  const styles = {
    crit: { bg: "var(--status-alert-bg)", text: "var(--status-alert)", border: "var(--border)" },
    high: { bg: "var(--status-warn-bg)",  text: "var(--status-warn)",  border: "var(--border)" },
    med:  { bg: "var(--status-warn-bg)",  text: "var(--status-warn)",  border: "var(--border)" },
    low:  { bg: "var(--status-done-bg)",  text: "var(--status-done)",  border: "var(--border)" },
  };
  const s = styles[sev];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      <span>{f.name}</span>
      <span style={{ fontWeight: 800 }}>{formatSignedRiskPoints(f.pts)}</span>
    </div>
  );
}

export function MiniRiskSparkline({ points }) {
  if (points.length < 2) return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>;
  const w = 84, h = 30;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const sy = v => valueToSparkY(v, 0, 100, h);
  const poly = points.map((p, i) => `${xs[i]},${sy(p.score)}`).join(" ");
  const last = points[points.length - 1], prev = points[points.length - 2];
  const delta = last.score - prev.score;
  const col = delta > 5 ? "var(--status-alert)" : delta < -5 ? "var(--status-done)" : "var(--text-muted)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
        <polyline points={poly} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={xs[xs.length - 1]} cy={sy(last.score)} r={3} fill={col} />
      </svg>
      <span style={{ fontSize: 11, fontWeight: 700, color: col, minWidth: 28 }}>{delta > 0 ? `+${delta}` : String(delta)}</span>
    </div>
  );
}
