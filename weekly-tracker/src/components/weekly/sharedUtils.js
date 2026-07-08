// Pure utility functions for the Weekly Reports feature (no React).
// Domain classification (status -> tier) lives in progressEngine.getWPStatusTier;
// these just map that tier to presentation (color/style).
import { getWPStatusTier } from '../../hooks/useProgressPresentation';

const TIER_COLOR = {
  done:  'var(--status-done)',
  good:  'var(--accent)',
  warn:  'var(--status-warn)',
  muted: 'var(--text-muted)',
};

const TIER_STYLE = {
  done:  { color: 'var(--status-done)', bg: 'var(--status-done-bg)', border: 'var(--border)' },
  good:  { color: 'var(--accent)',      bg: 'var(--accent-subtle)',  border: 'var(--border)' },
  warn:  { color: 'var(--status-warn)', bg: 'var(--status-warn-bg)', border: 'var(--border)' },
  muted: { color: 'var(--text-muted)',  bg: 'var(--bg-elevated)',    border: 'var(--border)' },
};

export function statusColor(status) {
  return TIER_COLOR[getWPStatusTier(status)];
}

export function statusStyles(status) {
  return TIER_STYLE[getWPStatusTier(status)];
}

// parseAdditionalWorksCost / formatAdditionalWorksSum moved to
// engines/additionalWorksEngine.js (architecture-conformance pass) —
// alongside the aggregation that consumes them.
