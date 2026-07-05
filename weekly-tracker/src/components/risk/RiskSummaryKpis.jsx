export default function RiskSummaryKpis({ summaryStats, riskColors }) {
  const avgHealthColor = summaryStats.avgHealth >= 75
    ? "var(--status-done)"
    : summaryStats.avgHealth >= 50
      ? "var(--status-warn)"
      : "var(--status-alert)";
  const avgHealthBg = summaryStats.avgHealth >= 75
    ? "var(--status-done-bg)"
    : summaryStats.avgHealth >= 50
      ? "var(--status-warn-bg)"
      : "var(--status-alert-bg)";

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
      <div style={{ textAlign: "center", background: avgHealthBg, border: '1.5px solid var(--border)', borderRadius: 12, padding: "10px 14px", minWidth: 70 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: avgHealthColor, lineHeight: 1 }}>{summaryStats.avgHealth}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Avg Health</div>
      </div>
      {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(level => {
        const c = riskColors[level];
        return (
          <div key={level} data-testid={`risk-kpi-${level.toLowerCase()}`} style={{ textAlign: "center", background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.text, lineHeight: 1 }}>{summaryStats[level]}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: c.text, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>{level}</div>
          </div>
        );
      })}
      <div style={{ textAlign: "center", background: "var(--accent-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{summaryStats.avgScore}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Avg Risk</div>
      </div>
      {summaryStats.opening30 > 0 && (
        <div style={{ textAlign: "center", background: "var(--status-warn-bg)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--status-warn)", lineHeight: 1 }}>{summaryStats.opening30}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--status-warn)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Open &lt;30d</div>
        </div>
      )}
      {summaryStats.pmMismatch > 0 && (
        <div style={{ textAlign: "center", background: "var(--accent-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{summaryStats.pmMismatch}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>PM Mismatch</div>
        </div>
      )}
    </div>
  );
}
