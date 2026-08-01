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
import { ASSESSMENT_AVAILABILITY, ASSESSMENT_REASON_CODE } from '../core/schedule/scheduleAssessmentAvailability.js';

/**
 * Phase 3D.1 (Section 7): riskScore, progress AND contScore all default to
 * artificially "fine-looking" values before any real evidence exists for a
 * CONTRACTOR_MANAGED project awaiting schedule commitment — riskScore.score
 * defaults to 0 (a neutral score, but combined with 0% progress it still
 * drags the blended score down), progress is genuinely 0%, and contScore
 * defaults to a hardcoded {performanceScore:50, pmAlignmentScore:50, ...}
 * (contractorEngine.js's own no-reports default). Blending all three
 * produces a worked, reproducible false "Critical" (score ~47) for a
 * brand-new project with zero reports — none of these three inputs reflect
 * anything real yet, so none may be blended into a fabricated number.
 * @param {'ASSESSABLE'|'NOT_ASSESSABLE'|null} [assessmentAvailability]
 */
export function computeProjectHealth(riskScore, progress, contScore, latestReport = null, assessmentAvailability = null) {
  if (assessmentAvailability === ASSESSMENT_AVAILABILITY.NOT_ASSESSABLE) {
    return {
      score: null,
      level: 'Not Assessable',
      color: 'var(--text-muted)',
      bg: 'var(--bg-elevated)',
      assessmentAvailability: ASSESSMENT_AVAILABILITY.NOT_ASSESSABLE,
      reasonCode: ASSESSMENT_REASON_CODE.AWAITING_SCHEDULE_COMMITMENT,
      reasons: [{ type: 'neutral', text: 'Awaiting schedule commitment — health not yet assessed', source: 'schedule' }],
    };
  }

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

  return {
    score, level, color, bg, reasons: sortReasons(reasons),
    assessmentAvailability: ASSESSMENT_AVAILABILITY.ASSESSABLE, reasonCode: null,
  };
}
