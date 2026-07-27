// homePresentation.js — Home-local presentation helpers.
//
// Pure functions only. Every input here is an already-computed value from
// core/home/homeDashboardModel.js (kpis/summary) or the canonical auth role
// (useAuth().role) — nothing here derives a business state, it only chooses
// how to display one. This consolidates duplication that existed across
// MorningBrief.jsx and PortfolioHealth.jsx (three copies of "pick a tone from
// a count/severity"); it is intentionally scoped to Home only, not a global
// StatusBadge/tone system.

export const TONE = {
  done:  'var(--status-done)',
  warn:  'var(--status-warn)',
  alert: 'var(--status-alert)',
  muted: 'var(--text-muted)',
};

// Highest-severity-wins tone for a critical/warning count pair.
export function severityTone({ critical = 0, warning = 0 }) {
  if (critical > 0) return TONE.alert;
  if (warning > 0) return TONE.warn;
  return TONE.done;
}

// Tone for a single "count of problems" stat — restTone when the count is
// zero (usually "good"), concernTone otherwise.
export function countTone(count, concernTone = TONE.warn, restTone = TONE.done) {
  return count > 0 ? concernTone : restTone;
}

// Whether Home has any projects at all vs. has projects but nothing flagged.
// 'empty'   — genuinely no projects yet (new tenant)
// 'healthy' — projects exist, zero critical/warning/info insights
// 'active'  — projects exist and there's at least one insight to show
export function getPortfolioState(projectCount, insightTotal) {
  if (!projectCount) return 'empty';
  if (!insightTotal) return 'healthy';
  return 'active';
}

// Role-aware display of a command's recommendedAction string. The action
// text (e.g. "Chase PM for weekly report", "Escalate to GC") is written from
// a PM's operational perspective — only PM sees it verbatim. Every other
// role that can reach Home (Admin, Viewer) sees neutral review-oriented
// wording instead, since neither is the project's PM and shouldn't be told
// to act as one.
export function displayAction(role, recommendedAction) {
  if (!recommendedAction) return null;
  return role === 'PM' ? recommendedAction : 'Needs review';
}
