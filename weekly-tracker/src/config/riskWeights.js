// Risk scoring weights — edit this file to tune the engine for your company.
// All values are in points on a 0-100 scale unless noted otherwise.
// The engine (riskEngine.js) reads these and never hard-codes its own numbers.

export const RISK_WEIGHTS = {

  // ── No-report risk (dynamic, time-aware) ──────────────────────────────────
  // Applied when a project has zero submitted reports.
  // Scores compound: a project opening tomorrow with 80 % expected progress
  // and no reports reaches HIGH / CRITICAL automatically.
  noReports: {
    base:                20,   // baseline for any project with no reports
    expectedProgress50:  10,   // time-elapsed progress > 50 % — data gap is risky
    expectedProgress75:  15,   // time-elapsed progress > 75 % — critical data gap
    startedAgo:           5,   // construction started > 30 days ago, still no updates
    opening90days:       15,   // target opening < 90 days away
    opening30days:       25,   // target opening < 30 days away
    openingOverdue:      35,   // past target opening date with no reports ever
    constructionOverdue: 30,   // past construction end date (if set separately from opening)
  },

  // ── Schedule deviation (deviation % → pts) ────────────────────────────────
  // Thresholds checked in order — first match wins.
  scheduleDeviation: [
    { above: 35, pts: 25 },
    { above: 25, pts: 20 },
    { above: 15, pts: 14 },
    { above: 8,  pts: 8  },
    { above: 3,  pts: 3  },
  ],

  // ── Reported risk scale ───────────────────────────────────────────────────
  riskScale: { High: 20, Medium: 12, Low: 4 },

  // ── Blocked activities ────────────────────────────────────────────────────
  blockedActivities: {
    first:    15,   // blocked for the first time in this report
    repeated: 20,   // blocked in ≥ 2 prior reports as well
  },

  // ── Risk indicator count ──────────────────────────────────────────────────
  riskIndicators: { perItem: 2.5, max: 10 },

  // ── Report staleness (days since last report → pts) ───────────────────────
  reportStaleness: { days9: 3, days14: 6, days21: 10, days30: 15 },

  // ── Opening proximity (projects that have at least one report) ────────────
  openingProximity: {
    overdue:          15,   // past target opening date
    days21:           15,   // < 21 days remaining
    days45:           12,   // < 45 days remaining
    days90:            7,   // < 90 days remaining
    days180:           3,   // < 180 days remaining
    lowProgressBonus:  5,   // added if < 30 days AND progress < 80 %
    max:              20,   // cap for this factor
  },

  // ── Historical deterioration (last 3 reports) ─────────────────────────────
  historicalDeterioration: { severe2of3: 15, atRisk3of3: 10, atRisk2of3: 5 },

  // ── Support required ──────────────────────────────────────────────────────
  supportRequired: 5,

  // ── PM site visit mismatch ────────────────────────────────────────────────
  pmMismatch: {
    perOverstatedItem:    3,
    maxOverstatement:    10,
    hiddenRiskSevere:    10,  // PM: Delayed / Critical  vs GC: On Track
    hiddenRiskModerate:   8,  // PM: At Risk             vs GC: On Track
    severityGap:          5,  // PM: Delayed / Critical  vs GC: At Risk
  },

  // ── EVM Schedule Performance Index ───────────────────────────────────────
  // Applied when SPI < 0.85 (progress / expected_pct)
  evmSpi: 15,

  // ── Recovery bonus (negative points applied after capping at 100) ─────────
  recovery: { fromSevere: -10, fromAtRisk: -8, minScore: 10 },

  // ── Weekly evolution mini-scoring (trend sparklines only) ─────────────────
  // Uses a lighter model so the chart reflects directional trends,
  // not the same absolute scale as the main risk score.
  weeklyEvolution: {
    scheduleStatus:    { Critical: 35, Delayed: 28, "At Risk": 20 },
    activitiesBlocked: 15,
    opening:           { days30: 15, days60: 10, days90: 6, days180: 3 },
  },
};
