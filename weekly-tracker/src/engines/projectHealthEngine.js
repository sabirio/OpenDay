// ── Project Health Engine ──────────────────────────────────────────────────────
//
// Single source of truth for project health scoring.
//
// Inputs:
//   riskScore  — from riskEngine.computeProjectRiskScore()
//   progress   — 0-100, from report utilities
//   contScore  — from contractorEngine.computeContractorScores()
//
// Output:
//   { score, level, color, bg, reasons }

export function computeProjectHealth(riskScore, progress, contScore) {
  const riskPts     = (1 - riskScore.score / 100) * 30;
  const progressPts = (progress / 100) * 25;
  const contPts     = (contScore.performanceScore / 100) * 20;
  const alignPts    = (contScore.pmAlignmentScore / 100) * 15;
  const pmPts       = (contScore.breakdown.pmAlignment / 30) * 10;
  const score = Math.min(100, Math.round(riskPts + progressPts + contPts + alignPts + pmPts));

  const level = score >= 75 ? "Healthy" : score >= 50 ? "Attention" : "Critical";
  const color = score >= 75 ? "var(--status-done)"  : score >= 50 ? "var(--status-warn)"  : "var(--status-alert)";
  const bg    = score >= 75 ? "var(--status-done-bg)" : score >= 50 ? "var(--status-warn-bg)" : "var(--status-alert-bg)";

  const reasons = [];
  if (riskScore.score >= 60)           reasons.push(`High risk score (${riskScore.score}/100)`);
  if (progress < 40)                   reasons.push(`Low progress at ${progress}%`);
  else if (progress < 70)             reasons.push(`Moderate progress at ${progress}%`);
  if (contScore.performanceScore < 60) reasons.push(`Contractor performance low (${contScore.performanceScore}/100)`);
  if (contScore.pmAlignmentScore < 60) reasons.push(`PM-GC alignment weak (${contScore.pmAlignmentScore}/100)`);
  if (contScore.breakdown.pmAlignment < 15) reasons.push("Limited PM site visit coverage");
  if (reasons.length === 0)            reasons.push("All health indicators positive");

  return { score, level, color, bg, reasons };
}
