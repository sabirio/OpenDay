// Pure utility functions for the Weekly Reports feature (no React).
import { WP_STATUS_SCORES } from '../../config/statusScores';

export function statusColor(status) {
  const score = WP_STATUS_SCORES[status] ?? 0;
  return score >= 1   ? 'var(--status-done)'
       : score >= 0.5 ? 'var(--accent)'
       : score >= 0.3 ? 'var(--status-warn)'
       :                'var(--text-muted)';
}

export function statusStyles(status) {
  const score = WP_STATUS_SCORES[status] ?? 0;
  if (score >= 1)   return { color: 'var(--status-done)',  bg: 'var(--status-done-bg)',  border: 'var(--border)' };
  if (score >= 0.5) return { color: 'var(--accent)',       bg: 'var(--accent-subtle)',   border: 'var(--border)' };
  if (score >= 0.3) return { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' };
  return              { color: 'var(--text-muted)',    bg: 'var(--bg-elevated)',     border: 'var(--border)' };
}

// parseAdditionalWorksCost / formatAdditionalWorksSum moved to
// engines/additionalWorksEngine.js (architecture-conformance pass) —
// alongside the aggregation that consumes them.
