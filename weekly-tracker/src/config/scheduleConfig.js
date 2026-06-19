/**
 * scheduleConfig.js — thresholds for schedule comparison and command generation.
 * All engine rules reference this object. Change values here to tune behaviour
 * without touching engine logic.
 */
export const SCHEDULE_CONFIG = {
  // ── Schedule-status thresholds (percentage points) ────────────────────────
  // actualPct - expectedPct >= +aheadThreshold  → "ahead"
  // actualPct - expectedPct <= -behindThreshold → "behind"
  // otherwise                                  → "on_track"
  aheadThreshold:  3,
  behindThreshold: 3,   // stored as positive; applied as ≤ -3

  // ── Command generation ─────────────────────────────────────────────────────
  missingReportDays: 10,  // days since last report before missing_report fires
};
