/**
 * Main Workspace headline signals — "where is risk" at a glance (avg
 * health + the 4 risk-level counts). Avg Score/Open<30d/PM Mismatch live in
 * SupportingRiskKpis below instead: useful context, but secondary to the
 * headline risk levels (Phase 4B Main Workspace vs. Inspector split).
 */
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
    <div className="risk-kpi-strip">
      <div className="risk-kpi-item" style={{ '--risk-kpi-color': avgHealthColor, '--risk-kpi-bg': avgHealthBg }}>
        <div className="risk-kpi-value">{summaryStats.avgHealth}</div>
        <div className="risk-kpi-label">Avg Health</div>
      </div>
      {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(level => {
        const c = riskColors[level];
        return (
          <div key={level} data-testid={`risk-kpi-${level.toLowerCase()}`} className="risk-kpi-item" style={{ '--risk-kpi-color': c.text, '--risk-kpi-bg': c.bg, '--risk-kpi-border': c.border }}>
            <div className="risk-kpi-value">{summaryStats[level]}</div>
            <div className="risk-kpi-label">{level}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Inspector "Supporting" section — average risk score, near-term openings,
 * and PM/GC mismatch count. Useful context, but secondary to the headline
 * risk-level counts above.
 */
export function SupportingRiskKpis({ summaryStats }) {
  if (summaryStats.avgScore == null && !summaryStats.opening30 && !summaryStats.pmMismatch) return null;

  return (
    <div className="risk-kpi-strip risk-kpi-strip-supporting">
      <div className="risk-kpi-item">
        <div className="risk-kpi-value">{summaryStats.avgScore}</div>
        <div className="risk-kpi-label">Avg Risk</div>
      </div>
      {summaryStats.opening30 > 0 && (
        <div className="risk-kpi-item" style={{ '--risk-kpi-color': 'var(--status-warn)', '--risk-kpi-bg': 'var(--status-warn-bg)' }}>
          <div className="risk-kpi-value">{summaryStats.opening30}</div>
          <div className="risk-kpi-label">Open &lt;30d</div>
        </div>
      )}
      {summaryStats.pmMismatch > 0 && (
        <div className="risk-kpi-item" style={{ '--risk-kpi-color': 'var(--accent)', '--risk-kpi-bg': 'var(--accent-subtle)' }}>
          <div className="risk-kpi-value">{summaryStats.pmMismatch}</div>
          <div className="risk-kpi-label">PM Mismatch</div>
        </div>
      )}
    </div>
  );
}
