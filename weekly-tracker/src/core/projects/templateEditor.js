import { normalizeWeightsTo100 } from './weights/normalizeWeightsTo100.js';

const phases = t => Array.isArray(t?.phases) ? t.phases : [];
const wps    = t => Array.isArray(t?.workPackages) ? t.workPackages : [];

export function setPhaseWeight(template, phaseId, weight) {
  const w = isNaN(Number(weight)) ? 0 : Number(weight);
  const updated = phases(template).map(p =>
    p.id === phaseId ? { ...p, progressWeight: w } : p
  );
  if (updated === phases(template)) return template; // id not found — same ref
  return { ...template, phases: updated };
}

export function setWorkPackageDuration(template, wpId, duration) {
  const d = isNaN(Number(duration)) ? 0 : Number(duration);
  const updated = wps(template).map(wp =>
    wp.id === wpId ? { ...wp, duration_pct: d } : wp
  );
  if (updated === wps(template)) return template;
  return { ...template, workPackages: updated };
}

export function movePhase(template, phaseId, direction) {
  const sorted = [...phases(template)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = sorted.findIndex(p => p.id === phaseId);
  if (idx === -1) return template;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return template;

  const reordered = sorted.slice();
  [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

  const withOrder = reordered.map((p, i) => ({ ...p, order: i + 1 }));
  return { ...template, phases: withOrder };
}

/**
 * Sums used by TemplateEditor.jsx's validation display: the total of all
 * phases' progressWeight (must equal 100) and, per phase, the total of its
 * work packages' duration_pct. Moved from two local calculations in the page
 * (architecture-conformance pass) — a .reduce() and a for-loop accumulator,
 * both aggregating template weight data into a displayed/validated number.
 *
 * @param {object|null} template
 * @returns {{ weightSum: number, durSums: Record<string, number> }}
 */
export function computeTemplateWeightSums(template) {
  const weightSum = phases(template).reduce((s, p) => s + (p.progressWeight || 0), 0);

  const durSums = {};
  for (const wp of wps(template)) {
    durSums[wp.phaseId] = (durSums[wp.phaseId] || 0) + (wp.duration_pct || 0);
  }

  return { weightSum, durSums };
}

// F-13/F-14 consolidation: delegates to the canonical largest-remainder
// rounding in normalizeWeightsTo100.js (used elsewhere by
// ProjectScopeConfigurator.jsx) instead of reimplementing the same
// algorithm here. Adapts between this file's phases-array contract and
// that function's (orderedIds, weights) map contract.
export function normalizeWeights(template) {
  const ps = phases(template);
  if (ps.length === 0) return template;

  const orderedIds = ps.map(p => p.id);
  const weights = Object.fromEntries(ps.map(p => [p.id, p.progressWeight]));
  const normalized = normalizeWeightsTo100(orderedIds, weights);

  const updatedPhases = ps.map(p => ({ ...p, progressWeight: normalized[p.id] }));
  return { ...template, phases: updatedPhases };
}
