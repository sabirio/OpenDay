// openingReadinessEngineV2.test.mjs — proves computeOpeningReadiness works
// correctly for the zoned v2 template via buildV2OpeningReadinessOptions,
// using the REAL (unmodified for v1) computeOpeningReadiness function.
// Run: node src/engines/__tests__/openingReadinessEngineV2.test.mjs

import { register } from 'node:module';
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeOpeningReadiness } = await import('../openingReadinessEngine.js');
const { buildV2OpeningReadinessOptions } = await import('../../core/projects/scope/buildV2OpeningReadinessOptions.js');
const { CATEGORY_LIBRARY } = await import('../../domains/construction/templates/retailFitoutV2.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const today = new Date();
const iso = (daysFromNow) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

console.log('\ncomputeOpeningReadiness + buildV2OpeningReadinessOptions — real integration');
{
  const v2Options = buildV2OpeningReadinessOptions();
  check('v2 blockerWPs is non-empty', v2Options.blockerWPs.length > 0);
  check('v2 blockerWPs phaseId is remapped to categoryId (matches wpCumulativeStatuses keying)',
    v2Options.blockerWPs.every(wp => wp.phaseId === wp.categoryId));

  // Nothing reported at all -> every v2 blocker WP should be flagged (A2-style
  // "never reported counts as Not Started" behavior, reused unchanged).
  const rEmpty = computeOpeningReadiness({ workPackageStatuses: {} }, iso(30), null, v2Options);
  check('unreported v2 blockers still appear', rEmpty.criticalBlockers.length > 0);
  check('requiredDays computed from the v2 dependency chain (>0)', rEmpty.requiredDays > 0);

  // Complete every v2 blocker WP (keyed by category id, matching buildV2ProgressTemplate) -> Ready.
  const wpStatuses = {};
  for (const wp of v2Options.blockerWPs) {
    if (!wpStatuses[wp.categoryId]) wpStatuses[wp.categoryId] = {};
    wpStatuses[wp.categoryId][wp.label] = { status: 'Completed', progress: 100 };
  }
  const rComplete = computeOpeningReadiness({ workPackageStatuses: wpStatuses }, iso(60), null, v2Options);
  check('all v2 blockers complete -> requiredDays 0', rComplete.requiredDays === 0);
  check('all v2 blockers complete -> status Ready', rComplete.status === 'Ready');

  // Sanity: category id actually resolves to a real label in CATEGORY_LIBRARY
  // (proves the remap targets a real, existing category, not a stale id).
  check('every blocker\'s categoryId resolves to a real CATEGORY_LIBRARY entry',
    v2Options.blockerWPs.every(wp => CATEGORY_LIBRARY[wp.categoryId] != null));
}

console.log('\ncomputeOpeningReadiness — v1 default path untouched when templateOptions omitted');
{
  // Same v1 fixture used elsewhere this session — proves the new 4th param
  // being entirely absent reproduces the exact pre-existing v1 behavior.
  const r = computeOpeningReadiness({ workPackageStatuses: {} }, iso(5));
  check('v1 (no templateOptions) still flags unreported blockers', r.criticalBlockers.length > 0);
  check('v1 (no templateOptions) still computes a verdict', r.verdict === 'NOT_ACHIEVABLE');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
