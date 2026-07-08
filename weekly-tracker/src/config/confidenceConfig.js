/**
 * P2.3: confidence-model tuning, kept out of pmAlignmentEngine.js so it can
 * be retuned (or eventually made company-specific — MVP is still one config
 * for the whole platform per the P1.5 "no full tenant admin UI yet" call)
 * without touching engine code.
 */

export const CONFIDENCE_WEIGHTS = {
  reportHistoryMax: 3,
  reportHistoryThresholds: [
    { count: 8, pts: 3 },
    { count: 4, pts: 2 },
    { count: 1, pts: 1 },
  ],

  pmSiteVisitsMax: 3,
  pmSiteVisitsThresholds: [
    { count: 2, pts: 3 },
    { count: 1, pts: 2 },
  ],

  reportFreshnessMax: 2,
  reportFreshnessFreshDays: 7,
  reportFreshnessStaleDays: 14,

  photoEvidenceMax: 2,

  // A report claiming a jump of this many percentage points (or more) in its
  // own overallProgress vs. the immediately preceding report, in one
  // reporting period, is treated as a self-reported claim worth double-
  // checking rather than trusting outright.
  suspiciousJumpThresholdPct: 60,
  suspiciousJumpPenalty: 3,
};

// Level cut points are expressed out of maxPts (sum of the *Max weights
// above, minus any applied penalties) — not a fixed literal, so adding a new
// positive factor above doesn't silently change what counts as "HIGH".
export const CONFIDENCE_LEVEL_THRESHOLDS = { HIGH: 0.75, MEDIUM: 0.4 };

// Single source of truth for the confidence-level vocabulary
// computeConfidenceLevel() produces (pmAlignmentEngine.js) — every
// "conf.level === 'HIGH'"-style comparison elsewhere should import this
// instead of hardcoding the string.
export const CONFIDENCE_LEVELS = Object.freeze({
  LOW:    "LOW",
  MEDIUM: "MEDIUM",
  HIGH:   "HIGH",
});
