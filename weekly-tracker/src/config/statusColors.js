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
