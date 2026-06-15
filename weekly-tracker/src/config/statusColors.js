// Single source of truth for all status-driven colors — dark design system palette.

// ─── Risk level ───────────────────────────────────────────────────────────────
export const RISK_LEVEL_COLORS = {
  CRITICAL: { text: '#fca5a5', bg: '#7f1d1d', border: '#991b1b' },
  HIGH:     { text: '#fdba74', bg: '#7c2d12', border: '#92400e' },
  MEDIUM:   { text: '#fdba74', bg: '#7c2d12', border: '#92400e' },
  LOW:      { text: '#6ee7b7', bg: '#064e3b', border: '#065f46' },
  UNKNOWN:  { text: '#9ca3af', bg: '#374151', border: '#4b5563' },
};

// ─── Schedule status (project-level) ─────────────────────────────────────────
export const SCHEDULE_STATUS_COLORS = {
  'On Track': '#10b981',
  'At Risk':  '#f97316',
  'Delayed':  '#ef4444',
  'Critical': '#ef4444',
};

// ─── Opening readiness ────────────────────────────────────────────────────────
export const OPENING_STATUS_COLORS = {
  Ready:     '#10b981',
  'At Risk': '#f97316',
  Critical:  '#ef4444',
  Overdue:   '#ef4444',
  'No Date': '#4b5563',
};

// ─── Progress bar color (0–100) ───────────────────────────────────────────────
export function progressColor(pct) {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#f97316';
  return '#ef4444';
}

// ─── WP task status cell ──────────────────────────────────────────────────────
export const WP_STATUS_CELL_COLORS = {
  Completed:        { bg: '#064e3b', text: '#6ee7b7', lbl: '✓' },
  'In Progress':    { bg: '#164e63', text: '#67e8f9', lbl: '▶' },
  Delayed:          { bg: '#7c2d12', text: '#fdba74', lbl: 'D' },
  'Not Started':    { bg: '#374151', text: '#9ca3af', lbl: '·' },
  'Not Applicable': { bg: '#374151', text: '#9ca3af', lbl: '–' },
};

// ─── SPI (Schedule Performance Index) status ─────────────────────────────────
export const SPI_STATUS = {
  on_schedule: { color: '#10b981', bg: '#064e3b', border: '#065f46', label: 'On Schedule' },
  at_risk:     { color: '#fdba74', bg: '#7c2d12', border: '#92400e', label: 'At Risk'     },
  critical:    { color: '#fca5a5', bg: '#7f1d1d', border: '#991b1b', label: 'Critical'    },
  no_schedule: { color: '#9ca3af', bg: '#374151', border: '#4b5563', label: 'No Schedule' },
};

export function getSPIStatus(spi) {
  if (spi === null || spi === undefined) return 'no_schedule';
  if (spi >= 0.95) return 'on_schedule';
  if (spi >= 0.80) return 'at_risk';
  return 'critical';
}

// ─── PM comparison cell ───────────────────────────────────────────────────────
export const PM_COMPARISON_COLORS = {
  match:          { type: 'match',         badge: '✓ Match',       color: '#6ee7b7', bg: '#064e3b', border: '#065f46' },
  discrepancy:    { type: 'discrepancy',   badge: '⚠ Discrepancy', color: '#fca5a5', bg: '#7f1d1d', border: '#991b1b' },
  'pm-higher':    { type: 'pm-higher',     badge: '↑ PM ahead',    color: '#fdba74', bg: '#7c2d12', border: '#92400e' },
  'not-assessed': { type: 'not-assessed',  badge: 'Not assessed',   color: '#9ca3af', bg: '#374151', border: '#4b5563' },
  'no-gc':        { type: 'no-gc',         badge: 'No GC data',    color: '#9ca3af', bg: '#374151', border: '#4b5563' },
  na:             { type: 'na',            badge: 'N/A',            color: '#9ca3af', bg: '#374151', border: '#4b5563' },
};
