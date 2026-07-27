// Single source of truth for status-driven colors — uses CSS custom properties
// so values automatically adapt to dark/light theme.

// ─── Risk level ───────────────────────────────────────────────────────────────
// Phase 2 status consolidation: config/riskConfig.js used to independently
// define a byte-for-byte-identical LOW/MEDIUM/HIGH/CRITICAL color table
// (RISK_COLORS) — it now re-exports this one instead. This remains the
// single canonical risk-level → color mapping; engines/riskEngine.js
// re-exports riskConfig's RISK_COLORS and stamps it onto every computed
// risk score, so this table's values are load-bearing for existing engine
// output shape, not purely cosmetic — do not change the color values here
// without checking that consumer.
export const RISK_LEVEL_COLORS = {
  CRITICAL: { text: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)' },
  HIGH:     { text: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
  MEDIUM:   { text: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
  LOW:      { text: 'var(--status-done)',  bg: 'var(--status-done-bg)',  border: 'var(--border)' },
  UNKNOWN:  { text: 'var(--text-muted)',   bg: 'var(--bg-elevated)',     border: 'var(--border)' },
};

// Phase 3 StatusBadge migration: the risk-level MASTER-LIST PILL (previously
// `.risk-master-level` CSS) has always rendered HIGH the same red as CRITICAL
// (`index.css`'s old `.is-high`/`.is-critical` both used `--status-alert`) —
// this diverges from RISK_LEVEL_COLORS.HIGH above (`--status-warn`, used for
// e.g. RiskBadge/HealthBadge/dimension cells). That divergence predates this
// migration; this map intentionally preserves the pill's existing on-screen
// color (HIGH+CRITICAL both "danger") rather than silently changing it to
// match RISK_LEVEL_COLORS — reconciling the two is a domain-color decision,
// not a presentation-consolidation one, and is out of scope here.
export const RISK_LEVEL_PILL_TONES = {
  CRITICAL: 'danger',
  HIGH:     'danger',
  MEDIUM:   'caution',
  LOW:      'positive',
  UNKNOWN:  'neutral',
};

export function riskLevelToTone(level) {
  return RISK_LEVEL_PILL_TONES[level] || 'neutral';
}

// A second, separate risk-level tone mapping — for the RiskGauge.jsx/
// DashboardWidgets.jsx family of `RiskBadge` components, which render
// straight off RISK_LEVEL_COLORS (HIGH shown as caution/orange, matching the
// canonical table exactly). Kept distinct from riskLevelToTone() above
// rather than merged, since merging would silently change one of the two
// existing on-screen HIGH-risk colors.
export const RISK_LEVEL_CANONICAL_TONES = {
  CRITICAL: 'danger',
  HIGH:     'caution',
  MEDIUM:   'caution',
  LOW:      'positive',
  UNKNOWN:  'neutral',
};

export function riskLevelToCanonicalTone(level) {
  return RISK_LEVEL_CANONICAL_TONES[level] || 'neutral';
}

// ─── Schedule status (projectScheduleStatus) ─────────────────────────────────
// Single source of truth for the On Track/At Risk/Critical/Delayed → tone
// mapping that DashboardWidgets.jsx's SchedBadge and weekly/shared.jsx's
// (name-colliding) local StatusBadge each independently reimplemented as a
// raw color/background style object (Phase 3 badge-family consolidation).
export const SCHEDULE_STATUS_TONES = {
  'On Track': 'positive',
  'Critical': 'danger',
  'Delayed':  'danger',
  'At Risk':  'caution',
};

export function schedStatusToTone(status) {
  return SCHEDULE_STATUS_TONES[status] || 'neutral';
}

// ─── SPI (Schedule Performance Index) status ─────────────────────────────────
export const SPI_STATUS = {
  on_schedule: { color: 'var(--status-done)',  bg: 'var(--status-done-bg)',  border: 'var(--border)', label: 'On Schedule' },
  at_risk:     { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)', label: 'At Risk'     },
  critical:    { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)', label: 'Critical'    },
  no_schedule: { color: 'var(--text-muted)',   bg: 'var(--bg-elevated)',     border: 'var(--border)', label: 'No Schedule' },
};

export function getSPIStatus(spi) {
  if (spi === null || spi === undefined) return 'no_schedule';
  if (spi >= 0.95) return 'on_schedule';
  if (spi >= 0.80) return 'at_risk';
  return 'critical';
}

// ─── Generic 0-100 score tier (performance/alignment/matchRate/reliability) ──
// Single source of truth for the >=80/>=60 tiering that RiskTable.jsx,
// risk/PmAlignmentTab.jsx, risk/ContractorsTab.jsx, weekly/SiteVisitComparison.jsx,
// weekly/ReportTruthBar.jsx, DriftChart.jsx and (Phase 3) risk/GanttSpiTab.jsx's
// Contractor Reliability Score each independently reimplemented
// (architecture-conformance pass). Does NOT cover every 0-100 score in the app —
// only call sites verified to already use exactly these cutoffs; a couple of
// call sites use different cutoffs (e.g. ProjectDetailDrawer.jsx's matchRate
// uses >=50 for its middle tier) and were deliberately left alone rather than
// silently normalized, since that would change the color those screens show.
export const SCORE_TIER_COLORS = {
  good:     'var(--status-done)',
  warn:     'var(--status-warn)',
  critical: 'var(--status-alert)',
};

export function getScoreTier(score) {
  if (score >= 80) return 'good';
  if (score >= 60) return 'warn';
  return 'critical';
}

// ─── Opening-countdown urgency (days to target opening) ──────────────────────
// Single source of truth for the < 0 / < 30 / < 90 tiering that
// dashboard/OverviewTab.jsx, dashboard/StatusMatrix.jsx, risk/OverviewTab.jsx
// and pages/SiteVisitSelect.jsx each independently reimplemented
// (architecture-conformance pass). `daysToOpening` itself should come from
// utils/reportUtils.daysUntil() (or an engine that already calls it) — this
// only classifies that number into a color.
export function getOpeningUrgencyColor(daysToOpening) {
  if (daysToOpening === null || daysToOpening === undefined) return 'var(--text-muted)';
  if (daysToOpening < 0)  return 'var(--status-alert)';
  if (daysToOpening < 30) return 'var(--status-alert)';
  if (daysToOpening < 90) return 'var(--status-warn)';
  return 'var(--status-done)';
}

// ─── Report-age (days since latest report) ────────────────────────────────────
// Single source of truth for the 0 / <=7 / <=14 tiering that
// dashboard/StatusMatrix.jsx's reportTag() and dashboard/ProjectDetailDrawer.jsx's
// ReportAgeBadge() independently reimplemented, byte-identical apart from
// their "no report yet" label copy (kept as each component's own choice).
// ─── Schedule deviation (percentage points behind plan) ───────────────────────
// Single source of truth for the >15 / >5 tiering that RiskTable.jsx and
// risk/OverviewTab.jsx independently reimplemented.
export function getScheduleDeviationColor(deviationPct) {
  if (deviationPct > 15) return 'var(--status-alert)';
  if (deviationPct > 5)  return 'var(--status-warn)';
  return 'var(--status-done)';
}

export function getReportAgeColor(daysSince) {
  if (daysSince === null || daysSince === undefined) return 'var(--status-alert)';
  if (daysSince === 0)  return 'var(--status-done)';
  if (daysSince <= 7)   return 'var(--status-done)';
  if (daysSince <= 14)  return 'var(--status-warn)';
  return 'var(--status-alert)';
}
