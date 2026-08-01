// buildV2ProgressTemplate.test.mjs — proves the v2 template bridges into the
// REAL, unmodified progressEngine.calculateProjectProgress (not a reimplementation).
// Run: node src/core/projects/weights/buildV2ProgressTemplate.test.mjs

import { register } from 'node:module';
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { calculateProjectProgress } = await import('../../../engines/progressEngine.js');
const { buildV2ProgressTemplate } = await import('./buildV2ProgressTemplate.js');
const { resolveEffectiveV2ZoneAreas } = await import('../areas/resolveProjectArea.js');
const { retailFitoutV2, CATEGORY_LIBRARY } = await import('../../../domains/construction/templates/retailFitoutV2.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function statusesFor(status, progress, categoryIds = null) {
  const out = {};
  for (const zone of retailFitoutV2.zones) {
    for (const cat of zone.categories) {
      if (categoryIds && !categoryIds.includes(cat.id)) continue;
      out[cat.id] = {};
      for (const wp of CATEGORY_LIBRARY[cat.id].workPackages) {
        out[cat.id][wp.label] = { status, progress };
      }
    }
  }
  return out;
}

console.log('\nbuildV2ProgressTemplate + progressEngine.calculateProjectProgress — real integration');
{
  const template = buildV2ProgressTemplate({ sales: 700, boh: 300 });
  check('template.phases count matches total category count (23)', template.phases.length === 23);
  const totalWPs = Object.values(CATEGORY_LIBRARY).reduce((s, c) => s + c.workPackages.length, 0);
  check('template.workPackages count matches total WP count', template.workPackages.length === totalWPs);

  const allComplete = statusesFor('Completed', 100);
  const pctComplete = calculateProjectProgress(allComplete, null, null, template);
  check('everything Completed -> 100% overall progress', pctComplete === 100);

  const allNotStarted = statusesFor('Not Started', 0);
  const pctNotStarted = calculateProjectProgress(allNotStarted, null, null, template);
  check('everything Not Started -> 0% overall progress', pctNotStarted === 0);

  // Only Common's categories done, Sales/BoH untouched -> overall progress
  // should land at ~common's own zone weight (35%, since common is fixed
  // regardless of area — with real 700/300 areas, common is exactly 35).
  const commonCategoryIds = retailFitoutV2.zones.find(z => z.id === 'common').categories.map(c => c.id);
  const onlyCommonDone = {
    ...statusesFor('Completed', 100, commonCategoryIds),
    ...statusesFor('Not Started', 0, retailFitoutV2.zones.filter(z => z.id !== 'common').flatMap(z => z.categories.map(c => c.id))),
  };
  const pctOnlyCommon = calculateProjectProgress(onlyCommonDone, null, null, template);
  check('only Common zone complete -> overall progress ≈ common\'s zone weight (35%)', Math.abs(pctOnlyCommon - 35) <= 1);
}

console.log('\nbuildV2ProgressTemplate — scope narrowing (activeZoneIds/activeCategoryIds)');
{
  const dropBoh = buildV2ProgressTemplate({ sales: 700, boh: 300 }, ['common', 'sales']);
  check('dropping boh zone removes its phases entirely', !dropBoh.phases.some(p => p.id.startsWith('boh.')));
  check('dropping boh zone removes its work packages entirely', !dropBoh.workPackages.some(wp => wp.id.startsWith('boh.')));

  const allComplete = statusesFor('Completed', 100, dropBoh.phases.map(p => p.id));
  const pct = calculateProjectProgress(allComplete, null, null, dropBoh);
  check('everything in the narrowed (common+sales) scope complete -> 100%', pct === 100);
}

console.log('\nbuildV2ProgressTemplate — canonical/legacy area equivalence');
{
  const legacyProject = {
    salesAreaSqm: 999,
    backOfHouseAreaSqm: 1,
    scope: { zoneAreas: { sales: 850, boh: 180 } },
  };
  const canonicalProject = { salesAreaSqm: 850, backOfHouseAreaSqm: 180, scope: null };
  const legacyTemplate = buildV2ProgressTemplate(resolveEffectiveV2ZoneAreas(legacyProject));
  const canonicalTemplate = buildV2ProgressTemplate(resolveEffectiveV2ZoneAreas(canonicalProject));
  check('equivalent effective old/new areas produce identical normalized v2 weights',
    JSON.stringify(legacyTemplate.phases) === JSON.stringify(canonicalTemplate.phases));
  check('legacy explicit zoneAreas remain effective when canonical columns disagree',
    resolveEffectiveV2ZoneAreas(legacyProject).sales === 850
      && resolveEffectiveV2ZoneAreas(legacyProject).boh === 180);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
