// thresholds.js - shared color thresholds for "days until target opening" displays.
//
// This exact 30/90-day threshold is currently duplicated inline in several
// other files (OverviewTab.jsx, StatusMatrix.jsx, RiskDashboard.jsx,
// SiteVisitSelect.jsx) with a slightly different null/negative handling in
// each. Only Projects.jsx has been migrated to this shared helper so far
// (Wave 8, Step 8.3) - the others are not touched yet to keep this step
// scoped to one page. TODO: migrate the remaining pages to getOpeningColor().

export function getOpeningColor(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return 'var(--text-muted)';
  if (daysLeft < 30) return 'var(--status-alert)';
  if (daysLeft < 90) return 'var(--status-warn)';
  return 'var(--status-done)';
}
