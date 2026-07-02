// Pure risk-aggregation helpers for the Risk Dashboard.
// Each function is stateless: in → out, nothing stored.

/**
 * Risk-level breakdown + health/score summary for Risk Dashboard header.
 * @param {Array} allRows - RiskDashboard allRows (each with riskScore, health, project)
 */
export function computeRiskSummaryStats(allRows) {
  const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  allRows.forEach(r => c[r.riskScore.level]++);
  const avgScore  = allRows.length ? Math.round(allRows.reduce((s, r) => s + r.riskScore.score, 0) / allRows.length) : 0;
  const avgHealth = allRows.length ? Math.round(allRows.reduce((s, r) => s + r.health.score, 0) / allRows.length) : 0;
  const now = new Date();
  const opening30  = allRows.filter(r => {
    const dTo = r.project.targetOpeningDate ? Math.ceil((new Date(r.project.targetOpeningDate) - now) / 86400000) : null;
    return dTo !== null && dTo >= 0 && dTo < 30;
  }).length;
  const pmMismatch = allRows.filter(r =>
    r.riskScore.factors.some(f => f.name === "PM Site Visit mismatch" || f.name === "Hidden risk (PM vs GC)")
  ).length;
  return { ...c, avgScore, avgHealth, opening30, pmMismatch };
}

