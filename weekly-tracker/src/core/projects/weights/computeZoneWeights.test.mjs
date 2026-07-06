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
