export function ScoreBar({ label, pts, max, color }) {
  const pct = Math.round((pts / max) * 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: "#94a3b8" }}>{label}</span>
        <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{pts} / {max}</span>
      </div>
      <div style={{ background: "#334155", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

export function FactorPill({ f }) {
  const neg = f.pts < 0;
  const sev = neg ? "low" : f.pts >= 12 ? "crit" : f.pts >= 6 ? "high" : "med";
  const styles = {
    crit: { bg: "#450a0a", text: "#fca5a5", border: "#7f1d1d" },
    high: { bg: "#431407", text: "#fdba74", border: "#c2410c" },
    med:  { bg: "#422006", text: "#fcd34d", border: "#b45309" },
    low:  { bg: "#052e16", text: "#86efac", border: "#166534" },
  };
  const s = styles[sev];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      <span>{f.name}</span>
      <span style={{ fontWeight: 800 }}>{neg ? `−${Math.abs(f.pts)}` : `+${f.pts}`}</span>
    </div>
  );
}

export function MiniRiskSparkline({ points }) {
  if (points.length < 2) return <span style={{ fontSize: 11, color: "#94a3b8" }}>—</span>;
  const w = 84, h = 30;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const sy = v => h - (v / 100) * h;
  const poly = points.map((p, i) => `${xs[i]},${sy(p.score)}`).join(" ");
  const last = points[points.length - 1], prev = points[points.length - 2];
  const delta = last.score - prev.score;
  const col = delta > 5 ? "#dc2626" : delta < -5 ? "#22c55e" : "#9ca3af";
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
