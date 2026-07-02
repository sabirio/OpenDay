import { sortInsights } from './insight.js';

/**
 * Flatten, deduplicate (first wins), and sort multiple Insight lists.
 * @param {...import('./insight.js').Insight[]} lists
 * @returns {import('./insight.js').Insight[]}
 */
export function mergeInsights(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }
  return sortInsights(merged);
}
