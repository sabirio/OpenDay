/**
 * Shared utilities for the Reason contract used by all engines.
 *
 * Reason shape: { type: 'critical'|'warning'|'neutral'|'positive', text: string, source: string }
 * Sort order:    critical → warning → neutral → positive
 *
 * Icons are intentionally absent — UI decides icons from reason.type.
 */

const TYPE_ORDER = { critical: 0, warning: 1, neutral: 2, positive: 3 };

export function sortReasons(reasons) {
  return [...reasons].sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99));
}
