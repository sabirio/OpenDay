// Single source of truth for all status-driven colors used across the UI.
// All values are light-mode palette hex strings.

// ─── Risk level ───────────────────────────────────────────────────────────────

export const RISK_LEVEL_COLORS = {
  CRITICAL: { text: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  HIGH:     { text: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  MEDIUM:   { text: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  LOW:      { text: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  UNKNOWN:  { text: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
};

// ─── Schedule status (project-level) ─────────────────────────────────────────

export const SCHEDULE_STATUS_COLORS = {
  "On Track": "#22c55e",
  "At Risk":  "#f59e0b",
  "Delayed":  "#ef4444",
  "Critical": "#ef4444",
};

// ─── Opening readiness ────────────────────────────────────────────────────────

export const OPENING_STATUS_COLORS = {
  Ready:     "#22c55e",
  "At Risk": "#f59e0b",
  Critical:  "#ef4444",
  Overdue:   "#ef4444",
  "No Date": "#6b7280",
};

// ─── Progress bar color (0–100) ───────────────────────────────────────────────

export function progressColor(pct) {
  if (pct >= 80) return "#22c55e";
  if (pct >= 50) return "#f59e0b";
  return "#ef4444";
}

// ─── WP task status cell ──────────────────────────────────────────────────────

export const WP_STATUS_CELL_COLORS = {
  Completed:        { bg: "#f0fdf4", text: "#16a34a", lbl: "✓" },
  "In Progress":    { bg: "#eff6ff", text: "#3b82f6", lbl: "▶" },
  Delayed:          { bg: "#fffbeb", text: "#d97706", lbl: "D" },
  "Not Started":    { bg: "#f9fafb", text: "#9ca3af", lbl: "·" },
  "Not Applicable": { bg: "#f9fafb", text: "#9ca3af", lbl: "–" },
};

// ─── SPI (Schedule Performance Index) status ─────────────────────────────────

export const SPI_STATUS = {
  on_schedule: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'On Schedule' },
  at_risk:     { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'At Risk'     },
  critical:    { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Critical'    },
  no_schedule: { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', label: 'No Schedule' },
};

export function getSPIStatus(spi) {
  if (spi === null || spi === undefined) return 'no_schedule';
  if (spi >= 0.95) return 'on_schedule';
  if (spi >= 0.80) return 'at_risk';
  return 'critical';
}

// ─── PM comparison cell ───────────────────────────────────────────────────────

export const PM_COMPARISON_COLORS = {
  match:          { type: "match",         badge: "✓ Match",       color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  discrepancy:    { type: "discrepancy",   badge: "⚠ Discrepancy", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  "pm-higher":    { type: "pm-higher",    badge: "↑ PM ahead",    color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  "not-assessed": { type: "not-assessed", badge: "Not assessed",   color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
  "no-gc":        { type: "no-gc",         badge: "No GC data",    color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
  na:             { type: "na",            badge: "N/A",            color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
};
