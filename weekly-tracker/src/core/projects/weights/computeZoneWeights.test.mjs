// computeZoneWeights.test.mjs — zoned retail fit-out v2 weighting contract.
// Run: node src/core/projects/weights/computeZoneWeights.test.mjs
//
// Zero-dependency: computeZoneWeights.js only imports normalizeWeightsTo100.js
// (no engine/config imports), and retailFitoutV2.js has no imports at all, so
// both resolve directly under plain `node` with no loader needed.

import { computeZoneWeights, computeZonedEffectiveWeights } from './computeZoneWeights.js';
import { retailFitoutV2, CATEGORY_LIBRARY } from '../../../domains/construction/templates/retailFitoutV2.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};
const close = (a, b, eps = 0.05) => Math.abs(a - b) < eps;
const sumOf = (obj) => Object.values(obj).reduce((s, w) => s + w, 0);

console.log('\ncomputeZoneWeights');
{
  const noAreas = computeZoneWeights(retailFitoutV2, {});
  check('common is always fixed at 35', noAreas.common === 35);
  check('all zones sum to exactly 100 (no areas, defaultWeight fallback)', sumOf(noAreas) === 100);
  check('no-area fallback stays roughly proportional to defaultWeight (45:20)',
    close(noAreas.sales, 45, 1) && close(noAreas.boh, 20, 1));

  const withAreas = computeZoneWeights(retailFitoutV2, { sales: 700, boh: 300 });
  check('common unaffected by areas, still 35', withAreas.common === 35);
  check('sales ≈ 45.5 for a 700/300 m² split', withAreas.sales === 45.5);
  check('boh ≈ 19.5 for a 700/300 m² split', withAreas.boh === 19.5);
  check('all zones sum to exactly 100 (with areas)', sumOf(withAreas) === 100);

  // Dropping a zone re-distributes its weight to the remaining active zone(s).
  const dropBoh = computeZoneWeights(retailFitoutV2, { sales: 700, boh: 300 }, ['common', 'sales']);
  check('dropping boh gives its entire share to sales', dropBoh.sales === 65);
  check('dropped zone is absent from the result entirely', !('boh' in dropBoh));
  check('sum still exactly 100 after dropping a zone', sumOf(dropBoh) === 100);

  // A wildly lopsided area split still sums to exactly 100 (drift-correction
  // robustness, not just the two spec-given examples).
  const lopsided = computeZoneWeights(retailFitoutV2, { sales: 1, boh: 999999 });
  check('lopsided area split still sums to exactly 100', sumOf(lopsided) === 100);

  const zeroAreas = computeZoneWeights(retailFitoutV2, { sales: 0, boh: 0 });
  check('all-zero areas falls back to defaultWeight ratio, not equal split',
    sumOf(zeroAreas) === 100 && zeroAreas.sales > zeroAreas.boh);
}

console.log('\ncomputeZoneWeights — F-01 regression: negative/garbage area in one zone must not produce a negative weight');
{
  // Root repro from the diagnostic audit: sales=-100 (typo/paste/stray minus),
  // boh=300 (a real, valid area). Before the fix, hasUsableArea's `.some(>0)`
  // check passed (boh is usable) and let sales' raw -100 flow unclamped into
  // the proportional split, producing sales: -32.5.
  const mixedSign = computeZoneWeights(retailFitoutV2, { sales: -100, boh: 300 });
  check('no zone weight goes negative when one area is negative and another is positive',
    Object.values(mixedSign).every(w => w >= 0));
  check('the negative-area zone is clamped to a 0 share, not a negative one', mixedSign.sales === 0);
  check('the remaining budget goes entirely to the valid positive-area zone', mixedSign.boh === 65);
  check('grand total still sums to exactly 100', sumOf(mixedSign) === 100);

  // Both areas negative (no zone has a *usable*, i.e. positive, area) must
  // still fall back to the defaultWeight ratio, exactly like the all-zero
  // case above — this must NOT regress into the clamped-raw-value path.
  const bothNegative = computeZoneWeights(retailFitoutV2, { sales: -100, boh: -300 });
  check('both-negative areas falls back to defaultWeight ratio (unchanged pre-fix behavior)',
    sumOf(bothNegative) === 100 && bothNegative.sales > bothNegative.boh &&
    close(bothNegative.sales, 45, 1) && close(bothNegative.boh, 20, 1));

  // Positive-input cases must be byte-identical to their pre-fix values —
  // the clamp must be a no-op whenever the input was already non-negative.
  check('0/0 unaffected by the clamp (still exact defaultWeight fallback)',
    close(computeZoneWeights(retailFitoutV2, { sales: 0, boh: 0 }).sales, 45, 1));
  check('500/500 unaffected by the clamp', computeZoneWeights(retailFitoutV2, { sales: 500, boh: 500 }).sales === 32.5);
  check('700/300 unaffected by the clamp (spec-exact 45.5/19.5)',
    computeZoneWeights(retailFitoutV2, { sales: 700, boh: 300 }).sales === 45.5);
  check('numeric strings ("700"/"300") still coerce correctly and are unaffected by the clamp',
    computeZoneWeights(retailFitoutV2, { sales: '700', boh: '300' }).sales === 45.5);

  // Full cascade: buildV2ProgressTemplate must never hand progressEngine a
  // negative progressWeight for any category, for any area input.
  const { buildV2ProgressTemplate } = await import('./buildV2ProgressTemplate.js');
  const negativeAreaTemplate = buildV2ProgressTemplate({ sales: -100, boh: 300 }, null, null);
  check('buildV2ProgressTemplate never produces a negative category progressWeight',
    negativeAreaTemplate.phases.every(p => p.progressWeight >= 0));

  // And the top-level progress number itself must never go negative (nor
  // become the pre-fix "-0") even when every WP in the garbage-area zone is
  // reported 100% complete.
  const { calculateProjectProgress } = await import('../../../engines/progressEngine.js');
  const wpStatuses = {};
  for (const wp of negativeAreaTemplate.workPackages) {
    if (!wp.id.startsWith('sales.')) continue;
    if (!wpStatuses[wp.phaseId]) wpStatuses[wp.phaseId] = {};
    wpStatuses[wp.phaseId][wp.label] = { status: 'Completed', progress: 100 };
  }
  const scopeWPIds = negativeAreaTemplate.workPackages.map(w => w.id);
  const progress = calculateProjectProgress(wpStatuses, scopeWPIds, null, negativeAreaTemplate);
  check('project-wide progress is a sane non-negative number, not -0, even with a garbage-area zone fully reported',
    Object.is(progress, -0) === false && progress >= 0);
}

console.log('\ncomputeZonedEffectiveWeights');
{
  const full = computeZonedEffectiveWeights(retailFitoutV2, CATEGORY_LIBRARY);
  check('full-scope effective WP weights sum ≈ 100', close(sumOf(full), 100, 0.5));

  const mepTotal = CATEGORY_LIBRARY['common.mep_backbone'].workPackages.reduce((s, wp) => s + (full[wp.id] ?? 0), 0);
  const demoTotal = CATEGORY_LIBRARY['common.demolition'].workPackages.reduce((s, wp) => s + (full[wp.id] ?? 0), 0);
  check('heavier category (common.mep_backbone, weight 40) outranks lighter (common.demolition, weight 8) within the same zone',
    mepTotal > demoTotal);

  // Dropping a category re-distributes its share to the categories still in scope.
  const allCommonCategoriesExceptDemolition = retailFitoutV2.zones
    .find(z => z.id === 'common').categories.map(c => c.id).filter(id => id !== 'common.demolition');
  const allOtherZoneCategories = retailFitoutV2.zones
    .filter(z => z.id !== 'common').flatMap(z => z.categories.map(c => c.id));
  const withoutDemo = computeZonedEffectiveWeights(retailFitoutV2, CATEGORY_LIBRARY, {
    activeCategoryIds: [...allCommonCategoriesExceptDemolition, ...allOtherZoneCategories],
  });
  const mepTotalAfterDrop = CATEGORY_LIBRARY['common.mep_backbone'].workPackages.reduce((s, wp) => s + (withoutDemo[wp.id] ?? 0), 0);
  check('dropping common.demolition redistributes its weight to common.mep_backbone (same zone)', mepTotalAfterDrop > mepTotal);
  check('common.demolition WPs are absent from the result once its category is dropped',
    CATEGORY_LIBRARY['common.demolition'].workPackages.every(wp => !(wp.id in withoutDemo)));

  // Dropping a whole zone (boh) removes its WPs and gives its zone-weight to sales.
  const withoutBoh = computeZonedEffectiveWeights(retailFitoutV2, CATEGORY_LIBRARY, { activeZoneIds: ['common', 'sales'] });
  check('boh WPs absent once its zone is dropped',
    CATEGORY_LIBRARY['boh.flooring'].workPackages.every(wp => !(wp.id in withoutBoh)));
  check('sum still ≈ 100 after dropping a whole zone', close(sumOf(withoutBoh), 100, 0.5));

  // scopeWPIds narrows within a category without redistributing (by design —
  // see the function's own doc comment: WP-level durationPct is used as-is).
  const oneWpOnly = computeZonedEffectiveWeights(retailFitoutV2, CATEGORY_LIBRARY, {
    scopeWPIds: ['common.mep_backbone.electrical_panels'],
  });
  check('scopeWPIds excludes other WPs from the result entirely', Object.keys(oneWpOnly).length === 1);
  check('the one in-scope WP keeps its own zoneWeight×categoryShare×durationPct value',
    close(oneWpOnly['common.mep_backbone.electrical_panels'], full['common.mep_backbone.electrical_panels'], 0.01));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
