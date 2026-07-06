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

export function normalizeWeights(template) {
  const ps = phases(template);
  if (ps.length === 0) return template;

  const sum = ps.reduce((s, p) => s + (p.progressWeight || 0), 0);

  let rounded;
  if (sum === 0) {
    const base  = Math.floor(100 / ps.length);
    const extra = 100 - base * ps.length;
    rounded = ps.map((_, i) => i < extra ? base + 1 : base);
  } else {
    rounded = ps.map(p => Math.round((p.progressWeight || 0) / sum * 100));
  }

  // Fix rounding drift by adjusting the phase with the largest weight
  const drift = 100 - rounded.reduce((s, w) => s + w, 0);
  if (drift !== 0) {
    const maxIdx = rounded.reduce((best, w, i) => w > rounded[best] ? i : best, 0);
    rounded[maxIdx] += drift;
  }

  const updatedPhases = ps.map((p, i) => ({ ...p, progressWeight: rounded[i] }));
  return { ...template, phases: updatedPhases };
}
