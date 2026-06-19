// ── Project Health Engine ──────────────────────────────────────────────────────
//
// Single source of truth for project health scoring.
//
// Inputs:
//   riskScore    — from riskEngine.computeProjectRiskScore()
//   progress     — 0-100, from report utilities
//   contScore    — from contractorEngine.computeContractorScores()
//   latestReport — optional; enables blocker/support reasons when provided
//
// Output:
//   { score, level, color, bg, reasons: Reason[] }
//
// Reason sort order: critical → warning → neutral → positive

import { sortReasons } from '../utils/reasonUtils';

export function computeProjectHealth(riskScore, progress, contScore, latestReport = null) {
  const riskPts     = (1 - riskScore.score / 100) * 30;
  const progressPts = (progress / 100) * 25;
  const contPts     = (contScore.performanceScore / 100) * 20;
  const alignPts    = (contScore.pmAlignmentScore / 100) * 15;
  const pmPts       = (contScore.breakdown.pmAlignment / 30) * 10;
  const score = Math.min(100, Math.round(riskPts + progressPts + contPts + alignPts + pmPts));

  const level = score >= 75 ? "Healthy" : score >= 50 ? "Attention" : "Critical";
  const color = score >= 75 ? "var(--status-done)"    : score >= 50 ? "var(--status-warn)"    : "var(--status-alert)";
  const bg    = score >= 75 ? "var(--status-done-bg)" : score >= 50 ? "var(--status-warn-bg)" : "var(--status-alert-bg)";

  const reasons = [];

  if (riskScore.score >= 80) {
    reasons.push({ type: 'critical', text: `High risk score (${riskScore.score}/100)`, source: 'risk' });
  } else if (riskScore.score >= 60) {
    reasons.push({ type: 'warning', text: `Elevated risk score (${riskScore.score}/100)`, source: 'risk' });
  } else {
    reasons.push({ type: 'positive', text: `Risk score healthy (${riskScore.score}/100)`, source: 'risk' });
  }

  if (progress < 40) {
    reasons.push({ type: 'critical', text: `Low progress at ${progress}%`, source: 'progress' });
  } else if (progress < 70) {
    reasons.push({ type: 'warning', text: `Moderate progress at ${progress}%`, source: 'progress' });
  } else {
    reasons.push({ type: 'positive', text: `Progress on track at ${progress}%`, source: 'progress' });
  }

  if (contScore.performanceScore < 60) {
    reasons.push({ type: 'warning', text: `Contractor performance low (${contScore.performanceScore}/100)`, source: 'contractor' });
  } else {
    reasons.push({ type: 'positive', text: `Contractor performance strong (${contScore.performanceScore}/100)`, source: 'contractor' });
  }

  if (contScore.pmAlignmentScore < 60) {
    reasons.push({ type: 'warning', text: `PM-GC alignment weak (${contScore.pmAlignmentScore}/100)`, source: 'contractor' });
  }

  if (contScore.breakdown.pmAlignment < 15) {
    reasons.push({ type: 'neutral', text: 'Limited PM site visit coverage', source: 'contractor' });
  }

  if (latestReport) {
    if (latestReport.activitiesBlocked === 'Yes') {
      reasons.push({ type: 'warning', text: 'Activities blocked', source: 'blocker' });
    } else {
      reasons.push({ type: 'positive', text: 'No blockers', source: 'blocker' });
    }
    if (latestReport.supportRequired === 'Yes') {
      reasons.push({ type: 'warning', text: 'Support required', source: 'support' });
    } else {
      reasons.push({ type: 'positive', text: 'No support requested', source: 'support' });
    }
  }

  return { score, level, color, bg, reasons: sortReasons(reasons) };
}
