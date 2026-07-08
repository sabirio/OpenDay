import { computeCumulativeStatuses, computeWPCumulativeStatuses, getStatusScore, DAY_MS, daysSince, daysUntil, isBadScheduleStatus, isSevereScheduleStatus } from "../utils/reportUtils";
import { calculateProjectProgressResult } from "./progressEngine";
import { computeExpectedPct } from "../utils/scheduleUtils";
import { computeCalendarSpi } from "./spiEngine";
import { getSPIStatus } from "../config/statusColors";
import { computePmAlignmentItems } from "./pmAlignmentEngine";
import { RISK_COLORS, RISK_DIMENSIONS, RISK_TO_DIMS, DIM_LEVEL_ORDER } from "../config/riskConfig";
import { RISK_WEIGHTS } from "../config/riskWeights";
import { sortReasons } from "../utils/reasonUtils";

// Re-export config constants so all existing imports from riskEngine keep working.
export { RISK_COLORS, RISK_DIMENSIONS, RISK_TO_DIMS, DIM_LEVEL_ORDER };

// ── Reason helpers ────────────────────────────────────────────────────────────

const FACTOR_SOURCE = {
  "Schedule deviation":                   "schedule",
  "EVM SPI critical":                     "schedule",
  "Historical deterioration":             "schedule",
  "Repeated blocker":                     "blocker",
  "Activities blocked":                   "blocker",
  "Opening proximity":                    "schedule",
  "Risk scale":                           "risk",
  "Risk indicators":                      "risk",
  "Report staleness":                     "risk",
  "PM Site Visit mismatch":               "contractor",
  "Hidden risk (PM vs GC)":              "contractor",
  "Severity gap (PM vs GC)":             "contractor",
  "Support required":                     "support",
  "Recovery detected":                    "progress",
  "No reports submitted":                 "risk",
  "No data — critical expected progress": "risk",
  "No data — high expected progress":     "risk",
  "Construction started, no updates":     "schedule",
  "Construction overdue":                 "schedule",
  "Opening overdue — no reports":         "schedule",
  "Opening imminent — no reports":        "schedule",
  "Opening proximity — no reports":       "schedule",
};

function factorsToReasons(factors) {
  return sortReasons(factors.map(f => ({
    type:   f.pts < 0  ? 'positive'
          : f.pts >= 15 ? 'critical'
          : f.pts >= 8  ? 'warning'
          : 'neutral',
    text:   `${f.name}: ${f.value}`,
    source: FACTOR_SOURCE[f.name] || 'risk',
  })));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

// Single source of truth for the risk-level vocabulary getRiskLevel() below
// produces — every "level === 'HIGH'"-style comparison elsewhere in the app
// should import these instead of hardcoding the string.
export const RISK_LEVELS = Object.freeze({
  LOW:      "LOW",
  MEDIUM:   "MEDIUM",
  HIGH:     "HIGH",
  CRITICAL: "CRITICAL",
});

export function getRiskLevel(score) {
  if (score >= 81) return RISK_LEVELS.CRITICAL;
  if (score >= 61) return RISK_LEVELS.HIGH;
  if (score >= 31) return RISK_LEVELS.MEDIUM;
  return RISK_LEVELS.LOW;
}

// True for HIGH or CRITICAL — the two-tier "needs attention now" gate several
// screens independently reimplemented as `level === 'HIGH' || level === 'CRITICAL'`.
// Ordering comes from DIM_LEVEL_ORDER (the same source escalationEngine.js
// already sorts by), so this also degrades safely for vocabularies that
// share just the 'HIGH'/'CRITICAL' strings without the full 4-tier scale
// (e.g. actionEngine's priority, projectSummaryEngine's scheduleRisk) —
// unrecognized values simply return false.
export function isHighOrCriticalLevel(level) {
  return DIM_LEVEL_ORDER.indexOf(level) >= DIM_LEVEL_ORDER.indexOf(RISK_LEVELS.HIGH);
}

// Risk score is always on a 0-100 scale (see getRiskLevel's cut points
// above) — display code showing "score / 100" should import this instead
// of hardcoding the denominator.
export const MAX_RISK_SCORE = 100;

/** "+12" / "−5" — signed display string for a risk factor's points delta. */
export function formatSignedRiskPoints(pts) {
  return pts < 0 ? `−${Math.abs(pts)}` : `+${pts}`;
}

/** 0-100 bar width for a risk factor's |pts| against a max scale (RiskTable's factor bars). */
export function computeFactorBarWidthPct(pts, maxPts = 20) {
  return Math.min(100, Math.round((Math.abs(pts) / maxPts) * 100));
}

// A2: bias-adjusted risk is a separate, opt-in view derived from the
// canonical riskScore plus the drift engine's additive factor - it never
// mutates riskScore itself (see computeRiskRowsModel.js).
export function computeAdjustedRisk(riskScore, driftRiskFactor) {
  const score = driftRiskFactor
    ? Math.min(100, riskScore.score + driftRiskFactor.pts)
    : riskScore.score;
  return { score, level: getRiskLevel(score) };
}

// ── Schedule Deviation ────────────────────────────────────────────────────────

export function computeScheduleDeviation(project, progress) {
  const start = project.constructionStartDate ? new Date(project.constructionStartDate) : null;
  const end   = project.constructionEndDate   ? new Date(project.constructionEndDate)
              : project.targetOpeningDate     ? new Date(project.targetOpeningDate) : null;
  const now = new Date();
  if (!start || !end || end <= start) return null;
  const totalDays   = Math.ceil((end - start) / DAY_MS);
  const elapsedDays = Math.max(0, Math.ceil((now - start) / DAY_MS));
  const expectedPct = computeExpectedPct(project, now);
  const deviationPct = Math.max(0, expectedPct - progress);
  const predictedDelayDays = deviationPct > 0 && progress < 100
    ? Math.round((deviationPct / 100) * totalDays) : 0;
  const predictedOpeningDate = project.targetOpeningDate && predictedDelayDays > 0
    ? new Date(new Date(project.targetOpeningDate).getTime() + predictedDelayDays * DAY_MS)
    : project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  return { expectedPct, actualPct: progress, deviationPct, predictedDelayDays, predictedOpeningDate, totalDays, elapsedDays };
}

// ── Trend ─────────────────────────────────────────────────────────────────────

export function computeTrend(sortedReports) {
  if (sortedReports.length < 2) return { trend: "Insufficient data", icon: "—", color: "var(--text-muted)", avgDiff: 0 };
  const points = sortedReports.map((_, i) => {
    const slice = sortedReports.slice(0, i + 1);
    const wpCum  = computeWPCumulativeStatuses(slice);
    const legCum = computeCumulativeStatuses(slice);
    return calculateProjectProgressResult(wpCum, legCum).progress;
  });
  const recent = points.slice(-Math.min(4, points.length));
  const diffs  = recent.slice(1).map((v, i) => v - recent[i]);
  if (!diffs.length) return { trend: "Insufficient data", icon: "—", color: "var(--text-muted)", avgDiff: 0 };
  const avgDiff = Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
  const lastDiff = diffs[diffs.length - 1];
  const prevAvg  = diffs.length >= 2 ? diffs.slice(0, -1).reduce((s, d) => s + d, 0) / (diffs.length - 1) : avgDiff;
  const velocitySlowing = diffs.length >= 2 && lastDiff < prevAvg - 2;
  if (avgDiff >= 5)  return { trend: "Improving",       icon: "↑",  color: "var(--status-done)", avgDiff };
  if (avgDiff >= 1)  return { trend: velocitySlowing ? "Acceleration Loss" : "Stable", icon: velocitySlowing ? "⚡" : "→", color: velocitySlowing ? "var(--status-warn)" : "var(--accent)", avgDiff };
  if (avgDiff >= -2) return { trend: "Stalling",        icon: "⚠",  color: "var(--status-warn)", avgDiff };
  return               { trend: "Deteriorating",        icon: "↓",  color: "var(--status-alert)", avgDiff };
}

// ── No-Report Risk (dynamic, time-aware) ─────────────────────────────────────
// Replaces the old fixed score=35 for projects with zero submitted reports.
// Factors: expected progress by elapsed time, opening proximity, construction lag.

function computeNoReportsRisk(project) {
  const W   = RISK_WEIGHTS.noReports;
  const now = new Date();
  let score     = W.base;
  const factors = [{ name: "No reports submitted", value: "Unknown", pts: W.base }];

  // Use constructionEndDate for schedule calc; fall back to targetOpeningDate.
  const start    = project.constructionStartDate ? new Date(project.constructionStartDate) : null;
  const schedEnd = project.constructionEndDate
    ? new Date(project.constructionEndDate)
    : project.targetOpeningDate
    ? new Date(project.targetOpeningDate)
    : null;

  // Schedule-based expected progress calculation
  if (start && schedEnd && schedEnd > start) {
    const elapsedDays = Math.max(0, Math.ceil((now - start) / DAY_MS));
    const expectedPct = computeExpectedPct(project, now);

    // Absence of data grows riskier as more time passes without updates
    if (expectedPct > 75) {
      score += W.expectedProgress75;
      factors.push({ name: "No data — critical expected progress", value: `${expectedPct}% expected, unreported`, pts: W.expectedProgress75 });
    } else if (expectedPct > 50) {
      score += W.expectedProgress50;
      factors.push({ name: "No data — high expected progress", value: `${expectedPct}% expected, unreported`, pts: W.expectedProgress50 });
    }

    // Construction started long ago but still completely silent
    if (elapsedDays > 30) {
      score += W.startedAgo;
      factors.push({ name: "Construction started, no updates", value: `${elapsedDays}d since start`, pts: W.startedAgo });
    }

    // Construction end date passed (only when set explicitly, not derived from opening date)
    if (project.constructionEndDate && now > new Date(project.constructionEndDate)) {
      score += W.constructionOverdue;
      factors.push({ name: "Construction overdue", value: "Past construction end date", pts: W.constructionOverdue });
    }
  }

  // Opening proximity penalty — scales with how close the deadline is
  if (project.targetOpeningDate) {
    const daysToOpen = daysUntil(project.targetOpeningDate);
    if (daysToOpen < 0) {
      score += W.openingOverdue;
      factors.push({ name: "Opening overdue — no reports", value: `${Math.abs(daysToOpen)}d overdue`, pts: W.openingOverdue });
    } else if (daysToOpen < 30) {
      score += W.opening30days;
      factors.push({ name: "Opening imminent — no reports", value: `${daysToOpen}d remaining`, pts: W.opening30days });
    } else if (daysToOpen < 90) {
      score += W.opening90days;
      factors.push({ name: "Opening proximity — no reports", value: `${daysToOpen}d remaining`, pts: W.opening90days });
    }
  }

  score = Math.min(100, Math.round(score));
  const level = getRiskLevel(score);
  // totalScore = raw, unclamped sum of every factor's pts — RiskTable.jsx's
  // expanded "Total score" row previously recomputed this itself; exposed here
  // so it's a single source of truth instead of a UI-side re-sum.
  const totalScore = factors.reduce((s, f) => s + f.pts, 0);
  return { score, level, color: RISK_COLORS[level], factors, rootCause: [], totalScore, reasons: factorsToReasons(factors) };
}

// ── Project Risk Score ────────────────────────────────────────────────────────
// All scoring weights come from RISK_WEIGHTS (riskWeights.js).
// Extend that config to change scoring without touching engine logic.

export function computeProjectRiskScore(project, projReports, progress, projSiteVisits, readiness = null) {
  // Dynamic risk for projects without reports
  if (!projReports.length) return computeNoReportsRisk(project);

  const sorted = [...projReports].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );
  const latest = sorted[sorted.length - 1];
  const now    = new Date();
  let score    = 0;
  const factors = [];

  // 1. Schedule deviation — configurable thresholds (deviation % → pts)
  {
    const expectedPct = computeExpectedPct(project, now);
    if (expectedPct !== null) {
      const deviation   = Math.max(0, expectedPct - progress);
      const pts = RISK_WEIGHTS.scheduleDeviation.find(t => deviation > t.above)?.pts ?? 0;
      score += pts;
      if (pts > 0) factors.push({ name: "Schedule deviation", value: `${deviation}% behind expected`, pts });
    }
  }

  // 2. Reported risk scale
  const scalePts = RISK_WEIGHTS.riskScale[latest.riskScale] ?? 0;
  score += scalePts;
  if (scalePts > 0) factors.push({ name: "Risk scale", value: latest.riskScale, pts: scalePts });

  // 3. Blocked activities — extra penalty if repeated
  if (latest.activitiesBlocked === "Yes") {
    const prevBlocked = sorted.slice(0, -1).filter(r => r.activitiesBlocked === "Yes").length;
    const pts = prevBlocked >= 2
      ? RISK_WEIGHTS.blockedActivities.repeated
      : RISK_WEIGHTS.blockedActivities.first;
    score += pts;
    factors.push({
      name:  prevBlocked >= 2 ? "Repeated blocker" : "Activities blocked",
      value: prevBlocked >= 2 ? `${prevBlocked + 1} reports` : "Yes",
      pts,
    });
  }

  // 4. Risk indicator count
  const riskCount = (latest.risks || []).filter(Boolean).length;
  const { perItem, max } = RISK_WEIGHTS.riskIndicators;
  const riskPts = Math.round(Math.min(max, riskCount * perItem));
  score += riskPts;
  if (riskPts > 0) factors.push({ name: "Risk indicators", value: `${riskCount} reported`, pts: riskPts });

  // 5. Report staleness
  const staleDays = daysSince(latest.reportingDate || latest.submittedAt);
  const S = RISK_WEIGHTS.reportStaleness;
  const stalePts = staleDays > 30 ? S.days30 : staleDays > 21 ? S.days21 : staleDays > 14 ? S.days14 : staleDays > 9 ? S.days9 : 0;
  score += stalePts;
  if (stalePts > 0) factors.push({ name: "Report staleness", value: `${staleDays}d since last report`, pts: stalePts });

  // 6. Opening proximity
  if (project.targetOpeningDate) {
    const daysToOpen = daysUntil(project.targetOpeningDate);
    const O = RISK_WEIGHTS.openingProximity;
    let openPts = daysToOpen < 0 ? O.overdue : daysToOpen < 21 ? O.days21 : daysToOpen < 45 ? O.days45 : daysToOpen < 90 ? O.days90 : daysToOpen < 180 ? O.days180 : 0;
    if (daysToOpen < 30 && progress < 80) openPts = Math.min(O.max, openPts + O.lowProgressBonus);
    score += openPts;
    if (openPts > 0) factors.push({ name: "Opening proximity", value: daysToOpen < 0 ? `${Math.abs(daysToOpen)}d overdue` : `${daysToOpen}d remaining`, pts: openPts });
  }

  // 6b. Opening not achievable (A3) — openingReadinessEngine already ran the
  // critical-path calc; this only reads its verdict, no recalculation here.
  if (readiness?.verdict === 'NOT_ACHIEVABLE') {
    score += RISK_WEIGHTS.openingNotAchievable;
    factors.push({
      name:  "Opening not achievable",
      value: `needs ~${Math.ceil(readiness.requiredDays)}d, short by ${Math.ceil(-readiness.slack)}d`,
      pts:   RISK_WEIGHTS.openingNotAchievable,
    });
  }

  // 7. EVM Schedule Performance Index — calendar SPI (actualPct / expectedPct).
  // Threshold tied to getSPIStatus 'critical' boundary (< 0.80) for consistency.
  // Skipped for completed projects — SPI < 1 is expected as work winds down.
  if (progress < 100) {
    const pv  = computeExpectedPct(project, now);
    const spi = computeCalendarSpi(progress, pv);
    if (getSPIStatus(spi) === 'critical') {
      score += RISK_WEIGHTS.evmSpi;
      factors.push({ name: "EVM SPI critical", value: `SPI ${spi}`, pts: RISK_WEIGHTS.evmSpi });
    }
  }

  // 8(renumbered). Historical deterioration (last 3 reports)
  if (sorted.length >= 3) {
    const atRiskN  = sorted.slice(-3).filter(r => isBadScheduleStatus(r.projectScheduleStatus)).length;
    const severeN  = sorted.slice(-3).filter(r => isSevereScheduleStatus(r.projectScheduleStatus)).length;
    const HD = RISK_WEIGHTS.historicalDeterioration;
    const detPts = severeN >= 2 ? HD.severe2of3 : atRiskN === 3 ? HD.atRisk3of3 : atRiskN === 2 ? HD.atRisk2of3 : 0;
    score += detPts;
    if (detPts > 0) factors.push({ name: "Historical deterioration", value: `${severeN > 0 ? `Severe ${severeN}` : `At Risk ${atRiskN}`}/3 recent`, pts: detPts });
  }

  // 8. Support required
  if (latest.supportRequired === "Yes") {
    const pts = RISK_WEIGHTS.supportRequired;
    score += pts;
    factors.push({ name: "Support required", value: "Yes", pts });
  }

  // 9. PM site visit mismatch — overstatements and hidden risk
  if (projSiteVisits && projSiteVisits.length > 0) {
    const latestVisit = [...projSiteVisits].sort(
      (a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt)
    )[0];
    const visitDate = new Date(latestVisit.visitDate || latestVisit.submittedAt);
    const gcAtVisit = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || latest;
    const items      = computePmAlignmentItems(gcAtVisit, latestVisit);
    const overstated = items.filter(i => i.overstate).length;
    const PM = RISK_WEIGHTS.pmMismatch;

    if (overstated > 0) {
      const pts = Math.min(PM.maxOverstatement, overstated * PM.perOverstatedItem);
      score += pts;
      factors.push({ name: "PM Site Visit mismatch", value: `${overstated} items overstated`, pts });
    }
    const pmBad  = isBadScheduleStatus(latestVisit.pmScheduleAssessment);
    const gcGood = latest.projectScheduleStatus === "On Track";
    const gcBad  = latest.projectScheduleStatus === "At Risk";
    if (pmBad && gcGood) {
      const pts = isSevereScheduleStatus(latestVisit.pmScheduleAssessment) ? PM.hiddenRiskSevere : PM.hiddenRiskModerate;
      score += pts;
      factors.push({ name: "Hidden risk (PM vs GC)", value: `PM: ${latestVisit.pmScheduleAssessment}, GC: On Track`, pts });
    } else if (isSevereScheduleStatus(latestVisit.pmScheduleAssessment) && gcBad) {
      score += PM.severityGap;
      factors.push({ name: "Severity gap (PM vs GC)", value: `PM: ${latestVisit.pmScheduleAssessment}, GC: At Risk`, pts: PM.severityGap });
    }
  }

  score = Math.min(100, Math.round(score));

  // Recovery bonus — project improved from At Risk / Delayed to On Track
  if (latest.projectScheduleStatus === "On Track" && sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    if (isBadScheduleStatus(prev.projectScheduleStatus)) {
      const R     = RISK_WEIGHTS.recovery;
      const bonus = isSevereScheduleStatus(prev.projectScheduleStatus) ? R.fromSevere : R.fromAtRisk;
      score = Math.max(R.minScore, score + bonus);
      factors.push({ name: "Recovery detected", value: `${prev.projectScheduleStatus} → On Track`, pts: bonus });
    }
  }

  // Root cause breakdown (category attribution)
  const FACTOR_CATS = {
    "Schedule deviation":        "Schedule",
    "EVM SPI critical":          "Schedule",
    "Historical deterioration":  "Schedule",
    "Repeated blocker":          "Schedule",
    "Activities blocked":        "Schedule",
    "Opening proximity":         "Opening",
    "Opening not achievable":    "Opening",
    "Risk scale":                "Contractor",
    "Risk indicators":           "Contractor",
    "Report staleness":          "Reporting",
    "PM Site Visit mismatch":    "PM Alignment",
    "Hidden risk (PM vs GC)":    "PM Alignment",
    "Severity gap (PM vs GC)":   "PM Alignment",
    "Support required":          "External",
  };
  const catPts = factors.filter(f => f.pts > 0).reduce((acc, f) => {
    const cat = FACTOR_CATS[f.name] || "Other";
    acc[cat] = (acc[cat] || 0) + f.pts;
    return acc;
  }, {});
  const totalPos = Object.values(catPts).reduce((s, v) => s + v, 0) || 1;
  const rootCause = Object.entries(catPts)
    .map(([cat, pts]) => ({ cat, pts, pct: Math.round((pts / totalPos) * 100) }))
    .sort((a, b) => b.pct - a.pct);

  const level = getRiskLevel(score);
  // totalScore = raw, unclamped sum of every factor's pts (including the
  // recovery-bonus factor, if one was pushed above) — RiskTable.jsx's expanded
  // "Total score" row previously recomputed this itself via the same reduce;
  // exposed here so it's a single source of truth instead of a UI-side re-sum.
  // Deliberately NOT the same value as `score` whenever the pre-clamp sum
  // exceeded 100 or a recovery bonus applied afterward — that divergence
  // already existed in the UI's own calculation and is preserved as-is.
  const totalScore = factors.reduce((s, f) => s + f.pts, 0);
  return { score, level, color: RISK_COLORS[level], factors, rootCause, totalScore, reasons: factorsToReasons(factors) };
}

// ── Dimension Risk ────────────────────────────────────────────────────────────

export function computeDimensionRisk(project, latestReport, riskScore, schedDev, contScore, projSiteVisits) {
  const dims = Object.fromEntries(RISK_DIMENSIONS.map(d => [d, "LOW"]));
  if (!latestReport) { RISK_DIMENSIONS.forEach(d => { dims[d] = "MEDIUM"; }); return dims; }

  const bump = (dim, level) => {
    if (!(dim in dims)) return;
    const cur = DIM_LEVEL_ORDER.indexOf(dims[dim]);
    const nxt = DIM_LEVEL_ORDER.indexOf(level);
    if (nxt > cur) dims[dim] = level;
  };

  (latestReport.risks || []).filter(Boolean).forEach(r => {
    (RISK_TO_DIMS[r] || []).forEach(d => bump(d, "HIGH"));
  });

  if (schedDev) {
    const dev   = schedDev.deviationPct;
    const sched = latestReport.projectScheduleStatus;
    if (dev > 25 || latestReport.activitiesBlocked === "Yes" || sched === "Delayed" || sched === "Critical") {
      bump("Schedule", "CRITICAL"); bump("Progress", "CRITICAL");
    } else if (dev > 15 || sched === "At Risk") {
      bump("Schedule", "HIGH"); bump("Progress", "HIGH");
    } else if (dev > 5) {
      bump("Schedule", "MEDIUM"); bump("Progress", "MEDIUM");
    }
  }

  if (latestReport.supportRequired === "Yes") bump("Support", "MEDIUM");

  if (project.targetOpeningDate) {
    const dTo = daysUntil(project.targetOpeningDate);
    if (dTo < 0)  bump("Opening", "CRITICAL");
    else if (dTo < 30)  bump("Opening", riskScore.score > 60 ? "CRITICAL" : "HIGH");
    else if (dTo < 90)  bump("Opening", riskScore.score > 40 ? "HIGH" : "MEDIUM");
  }

  const riskOwners = latestReport.riskOwners || [];
  if (riskOwners.includes("General Contractor")) {
    if (latestReport.riskScale === "High")   bump("Contractor", "HIGH");
    else if (latestReport.riskScale === "Medium") bump("Contractor", "MEDIUM");
  }

  const snag = latestReport.handoverStatuses?.["Snag list resolution"];
  if (snag && getStatusScore(snag) < 0.5 && project.targetOpeningDate) {
    const dTo = Math.ceil((new Date(project.targetOpeningDate) - new Date()) / 86400000);
    if (dTo < 60) bump("Quality", "HIGH");
    else if (dTo < 90) bump("Quality", "MEDIUM");
  }

  if ((latestReport.risks || []).includes("Safety or External Factors")) bump("Safety", "HIGH");
  const fireSafety = latestReport.constructionStatuses?.["Fire safety systems installation"];
  if (fireSafety && getStatusScore(fireSafety) < 0.5 && schedDev && schedDev.deviationPct > 15) bump("Safety", "MEDIUM");

  if (contScore) {
    if (contScore.breakdown.reporting < 8)   bump("Reporting", "CRITICAL");
    else if (contScore.breakdown.reporting < 13) bump("Reporting", "HIGH");
    else if (contScore.breakdown.reporting < 17) bump("Reporting", "MEDIUM");
  }
  const reportAge = daysSince(latestReport.reportingDate || latestReport.submittedAt);
  if (reportAge > 21)      bump("Reporting", "HIGH");
  else if (reportAge > 14) bump("Reporting", "MEDIUM");

  if (projSiteVisits && projSiteVisits.length > 0) {
    const mismatchFactor = riskScore.factors.find(f => f.name === "PM Site Visit mismatch" || f.name === "Hidden risk (PM vs GC)");
    if (mismatchFactor) {
      if (mismatchFactor.pts >= 8)      bump("PM Alignment", "CRITICAL");
      else if (mismatchFactor.pts >= 5) bump("PM Alignment", "HIGH");
      else                              bump("PM Alignment", "MEDIUM");
    }
  }

  if (latestReport.additionalWorks === "Yes") bump("Commercial", "MEDIUM");

  return dims;
}

// ── Weekly Evolution ──────────────────────────────────────────────────────────
// Lightweight scoring used only for trend sparklines.
// Uses the same configurable weights as the main engine where they overlap.

export function computeWeeklyEvolution(sortedReports, project) {
  const WE = RISK_WEIGHTS.weeklyEvolution;
  return sortedReports.map(r => {
    let s = 0;
    s += WE.scheduleStatus[r.projectScheduleStatus] ?? 0;
    if (r.activitiesBlocked === "Yes") s += WE.activitiesBlocked;
    s += RISK_WEIGHTS.riskScale[r.riskScale] ?? 0;
    s += Math.round(Math.min(RISK_WEIGHTS.riskIndicators.max, ((r.risks || []).filter(Boolean).length) * RISK_WEIGHTS.riskIndicators.perItem));
    if (r.supportRequired === "Yes") s += RISK_WEIGHTS.supportRequired;
    if (project.targetOpeningDate) {
      const dTo = Math.ceil((new Date(project.targetOpeningDate) - new Date(r.reportingDate || r.submittedAt)) / 86400000);
      const O = WE.opening;
      s += dTo < 30 ? O.days30 : dTo < 60 ? O.days60 : dTo < 90 ? O.days90 : dTo < 180 ? O.days180 : 0;
    }
    return { date: r.reportingDate || r.submittedAt, score: Math.min(100, Math.round(s)), level: getRiskLevel(Math.min(100, Math.round(s))) };
  });
}
