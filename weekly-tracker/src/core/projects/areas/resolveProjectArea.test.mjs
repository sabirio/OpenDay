import assert from 'node:assert/strict';
import {
  PROJECT_AREA_BASIS,
  clearProjectScopeSelection,
  mergeProjectScopeSelection,
  resolveEffectiveV2ZoneAreas,
  resolveProjectArea,
  resolveProjectAreaContext,
} from './resolveProjectArea.js';

let passed = 0;
function check(name, test) {
  test();
  passed += 1;
  console.log(`  OK ${name}`);
}

const canonical = {
  storeSizeSqm: '1100',
  salesAreaSqm: 850,
  backOfHouseAreaSqm: 180,
  scope: { zones: ['common', 'sales', 'boh'] },
};

check('TOTAL_AREA resolves from the canonical total-area column', () => {
  assert.equal(resolveProjectArea(canonical, PROJECT_AREA_BASIS.TOTAL_AREA), 1100);
});
check('SALES_AREA resolves from the canonical sales-area column', () => {
  assert.equal(resolveProjectArea(canonical, PROJECT_AREA_BASIS.SALES_AREA), 850);
});
check('BOH_AREA resolves from the canonical BOH-area column', () => {
  assert.equal(resolveProjectArea(canonical, PROJECT_AREA_BASIS.BOH_AREA), 180);
});
check('NONE is explicit null, not numeric zero', () => {
  assert.equal(resolveProjectArea(canonical, PROJECT_AREA_BASIS.NONE), null);
});
check('snake_case DB rows resolve through the same contract', () => {
  assert.equal(resolveProjectArea({ sales_area_sqm: 850 }, PROJECT_AREA_BASIS.SALES_AREA), 850);
});
check('missing, negative, and non-finite canonical values resolve consistently to null', () => {
  assert.equal(resolveProjectArea({}, PROJECT_AREA_BASIS.TOTAL_AREA), null);
  assert.equal(resolveProjectArea({ salesAreaSqm: -1 }, PROJECT_AREA_BASIS.SALES_AREA), null);
  assert.equal(resolveProjectArea({ backOfHouseAreaSqm: 'nope' }, PROJECT_AREA_BASIS.BOH_AREA), null);
});
check('new canonical projects derive v2 zone inputs from project columns', () => {
  assert.deepEqual(resolveEffectiveV2ZoneAreas(canonical), { sales: 850, boh: 180 });
});
check('legacy explicit zoneAreas win without rewriting disagreeing canonical facts', () => {
  const legacy = { ...canonical, scope: { ...canonical.scope, zoneAreas: { sales: 700, boh: 300 } } };
  assert.deepEqual(resolveProjectAreaContext(legacy), {
    source: 'legacy-scope',
    totalArea: 1100,
    salesArea: 700,
    bohArea: 300,
    zoneAreas: { sales: 700, boh: 300 },
  });
});
check('legacy scope selection updates preserve historical zoneAreas', () => {
  const legacy = { scope: { zoneAreas: { sales: 700, boh: 300 } } };
  assert.deepEqual(
    mergeProjectScopeSelection(legacy, { zones: ['common'], workPackages: ['common.demo'] }),
    { zones: ['common'], workPackages: ['common.demo'], zoneAreas: { sales: 700, boh: 300 } },
  );
  assert.deepEqual(clearProjectScopeSelection(legacy), { zoneAreas: { sales: 700, boh: 300 } });
});
check('new scope selections never gain duplicate zoneAreas', () => {
  assert.deepEqual(
    mergeProjectScopeSelection(canonical, { zones: ['common'], zoneAreas: { sales: 999 } }),
    { zones: ['common'] },
  );
  assert.equal(clearProjectScopeSelection(canonical), null);
});
console.log(`\n-- RESULT: ${passed} passed, 0 failed --\n`);
