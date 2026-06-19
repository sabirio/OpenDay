// Single source of truth for status-driven colors — uses CSS custom properties
// so values automatically adapt to dark/light theme.

// ─── Risk level ───────────────────────────────────────────────────────────────
export const RISK_LEVEL_COLORS = {
  CRITICAL: { text: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)' },
  HIGH:     { text: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
  MEDIUM:   { text: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
  LOW:      { text: 'var(--status-done)',  bg: 'var(--status-done-bg)',  border: 'var(--border)' },
  UNKNOWN:  { text: 'var(--text-muted)',   bg: 'var(--bg-elevated)',     border: 'var(--border)' },
};

// ─── Schedule status (project-level) ─────────────────────────────────────────
export const SCHEDULE_STATUS_COLORS = {
  'On Track': 'var(--status-done)',
  'At Risk':  'var(--status-warn)',
  'Delayed':  'var(--status-alert)',
  'Critical': 'var(--status-alert)',
};

// ─── Opening readiness ────────────────────────────────────────────────────────
export const OPENING_STATUS_COLORS = {
  Ready:     'var(--status-done)',
  'At Risk': 'var(--status-warn)',
  Critical:  'var(--status-alert)',
  Overdue:   'var(--status-alert)',
  'No Date': 'var(--text-muted)',
};

// ─── Progress bar color (0–100) ───────────────────────────────────────────────
export function progressColor(pct) {
  if (pct >= 80) return 'var(--status-done)';
  if (pct >= 50) return 'var(--status-warn)';
  return 'var(--status-alert)';
}

// ─── WP task status cell ──────────────────────────────────────────────────────
export const WP_STATUS_CELL_COLORS = {
  Completed:        { bg: 'var(--status-done-bg)',   text: 'var(--status-done)',  lbl: '✓' },
  'In Progress':    { bg: 'var(--accent-subtle)',    text: 'var(--accent)',       lbl: '▶' },
  Delayed:          { bg: 'var(--status-warn-bg)',   text: 'var(--status-warn)',  lbl: 'D' },
  'Not Started':    { bg: 'var(--bg-elevated)',      text: 'var(--text-muted)',   lbl: '·' },
  'Not Applicable': { bg: 'var(--bg-elevated)',      text: 'var(--text-muted)',   lbl: '–' },
};

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

// ─── PM comparison cell ───────────────────────────────────────────────────────
export const PM_COMPARISON_COLORS = {
  match:          { type: 'match',         badge: '✓ Match',       color: 'var(--status-done)',  bg: 'var(--status-done-bg)',  border: 'var(--border)' },
  discrepancy:    { type: 'discrepancy',   badge: '⚠ Discrepancy', color: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)' },
  'pm-higher':    { type: 'pm-higher',     badge: '↑ PM ahead',    color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
  'not-assessed': { type: 'not-assessed',  badge: 'Not assessed',  color: 'var(--text-muted)',   bg: 'var(--bg-elevated)',     border: 'var(--border)' },
  'no-gc':        { type: 'no-gc',         badge: 'No GC data',    color: 'var(--text-muted)',   bg: 'var(--bg-elevated)',     border: 'var(--border)' },
  na:             { type: 'na',            badge: 'N/A',           color: 'var(--text-muted)',   bg: 'var(--bg-elevated)',     border: 'var(--border)' },
};
