// Single source of truth for all status-driven colors used across the UI.
// All values are dark-mode palette hex strings.

// ─── Risk level ───────────────────────────────────────────────────────────────

export const RISK_LEVEL_COLORS = {
  CRITICAL: { text: "#fca5a5", bg: "#450a0a", border: "#7f1d1d" },
  HIGH:     { text: "#fdba74", bg: "#431407", border: "#c2410c" },
  MEDIUM:   { text: "#fcd34d", bg: "#422006", border: "#b45309" },
  LOW:      { text: "#86efac", bg: "#052e16", border: "#166534" },
  UNKNOWN:  { text: "#94a3b8", bg: "#1e293b", border: "#334155" },
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
  "No Date": "#64748b",
};

// ─── Progress bar color (0–100) ───────────────────────────────────────────────

export function progressColor(pct) {
  if (pct >= 80) return "#22c55e";
  if (pct >= 50) return "#f59e0b";
  return "#ef4444";
}

// ─── WP task status cell ──────────────────────────────────────────────────────

export const WP_STATUS_CELL_COLORS = {
  Completed:      { bg: "#052e16", text: "#86efac", lbl: "✓" },
  "In Progress":  { bg: "#1e3a5f", text: "#93c5fd", lbl: "▶" },
  Delayed:        { bg: "#422006", text: "#fcd34d", lbl: "D" },
  "Not Started":  { bg: "#1e293b", text: "#475569", lbl: "·" },
  "Not Applicable": { bg: "#1e293b", text: "#475569", lbl: "–" },
};

// ─── PM comparison cell ───────────────────────────────────────────────────────

export const PM_COMPARISON_COLORS = {
  match:        { type: "match",        badge: "✓ Match",       color: "#86efac", bg: "#052e16", border: "#166534" },
  discrepancy:  { type: "discrepancy",  badge: "⚠ Discrepancy", color: "#fca5a5", bg: "#450a0a", border: "#7f1d1d" },
  "pm-higher":  { type: "pm-higher",   badge: "↑ PM ahead",    color: "#fcd34d", bg: "#422006", border: "#b45309" },
  "not-assessed": { type: "not-assessed", badge: "Not assessed", color: "#94a3b8", bg: "#1e293b", border: "#334155" },
  "no-gc":      { type: "no-gc",        badge: "No GC data",    color: "#94a3b8", bg: "#0f172a", border: "#334155" },
  na:           { type: "na",           badge: "N/A",            color: "#94a3b8", bg: "#0f172a", border: "#334155" },
};
