// projectInfoArchitecture.test.mjs — Project Information Architecture v1
// contract: validateProject()'s Mall/Street invariant + new field
// validation, and fromDB()/toDB()'s round-trip of the new Retail Project
// Profile fields (location_type/store_concept/areas/actual dates/financial).
// Run: node src/tests/projectInfoArchitecture.test.mjs
//
// projectService.js imports '../lib/supabase', which reads import.meta.env
// (Vite-only) and throws under plain node — so, like
// contractorReportService.test.mjs, a loader mock replaces that import
// before the real module is loaded.

import { register } from 'node:module';

function moduleDataUrl(src) {
  return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`;
}

const supabaseMockUrl = moduleDataUrl(`export const supabase = {};`);

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === '../lib/supabase' &&
    context.parentURL?.endsWith('/services/projectService.js')
  ) {
    return { url: '${supabaseMockUrl}', shortCircuit: true };
  }
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;

register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const { validateProject, fromDB, toDB } = await import('../services/projectService.js');

console.log('\nvalidateProject — Mall/Street mutual exclusivity');

check('Mall without shoppingMallName throws', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', locationType: 'Mall' }); return false; }
  catch (e) { return /Shopping Mall Name/.test(e.message); }
})());

check('Street without street throws', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', locationType: 'Street' }); return false; }
  catch (e) { return /Street Address/.test(e.message); }
})());

check('Mall with shoppingMallName passes', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', locationType: 'Mall', shoppingMallName: 'MEGA' }); return true; }
  catch { return false; }
})());

check('Street with street passes', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', locationType: 'Street', street: 'Abay Ave 42' }); return true; }
  catch { return false; }
})());

check('no locationType at all does not require either field (legacy-safe)', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ' }); return true; }
  catch { return false; }
})());

console.log('\nvalidateProject — areas');

check('negative storeSizeSqm throws', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', storeSizeSqm: -1 }); return false; }
  catch (e) { return /cannot be negative/.test(e.message); }
})());

check('salesAreaSqm > storeSizeSqm throws', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', storeSizeSqm: 100, salesAreaSqm: 150 }); return false; }
  catch (e) { return /Sales Area cannot exceed Total Area/.test(e.message); }
})());

check('salesAreaSqm of 0 passes (zero is a valid area, not "missing")', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', storeSizeSqm: 100, salesAreaSqm: 0 }); return true; }
  catch { return false; }
})());

check('salesAreaSqm === storeSizeSqm passes (boundary, not "exceeds")', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', storeSizeSqm: 100, salesAreaSqm: 100 }); return true; }
  catch { return false; }
})());

console.log('\nvalidateProject — financial');

check('negative budget throws', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', budget: -1 }); return false; }
  catch (e) { return /cannot be negative/.test(e.message); }
})());

check('budget set without currencyCode throws', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', budget: 1000 }); return false; }
  catch (e) { return /Currency is required/.test(e.message); }
})());

check('budget with currencyCode passes', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', budget: 1000, currencyCode: 'KZT' }); return true; }
  catch { return false; }
})());

check('actualCost set without currencyCode throws (same currency requirement as budget)', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', actualCost: 5000 }); return false; }
  catch (e) { return /Currency is required/.test(e.message); }
})());

check('negative actualCost throws', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', actualCost: -1, currencyCode: 'KZT' }); return false; }
  catch (e) { return /cannot be negative/.test(e.message); }
})());

check('actualCost with currencyCode passes', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', actualCost: 525000, currencyCode: 'KZT' }); return true; }
  catch { return false; }
})());

console.log('\nvalidateProject — dates');

check('invalid date string throws', (() => {
  try { validateProject({ storeCode: 'X', country: 'KZ', targetOpeningDate: 'not-a-date' }); return false; }
  catch (e) { return /Invalid date/.test(e.message); }
})());

console.log('\nfromDB — "unknown ≠ zero" for numeric fields');

check('sales_area_sqm of 0 stays 0, not null', fromDB({ sales_area_sqm: 0 }).salesAreaSqm === 0);
check('back_of_house_area_sqm of 0 stays 0, not null', fromDB({ back_of_house_area_sqm: 0 }).backOfHouseAreaSqm === 0);
check('budget of 0 stays 0, not null', fromDB({ budget: 0 }).budget === 0);
check('actual_cost of 0 stays 0, not null', fromDB({ actual_cost: 0 }).actualCost === 0);
check('missing sales_area_sqm becomes null', fromDB({}).salesAreaSqm === null);
check('location_type passes through', fromDB({ location_type: 'Mall' }).locationType === 'Mall');
check('store_concept passes through', fromDB({ store_concept: 'Flagship' }).storeConcept === 'Flagship');
check('actual dates pass through', fromDB({ actual_opening_date: '2026-08-01' }).actualOpeningDate === '2026-08-01');

console.log('\ntoDB — Mall/Street defensive nulling at the write boundary');

check('Mall project nulls out street even if stale street is present',
  toDB({ storeCode: 'X', locationType: 'Mall', shoppingMallName: 'MEGA', street: 'stale address' }).street === null);
check('Street project nulls out shopping_mall_name even if stale mall name is present',
  toDB({ storeCode: 'X', locationType: 'Street', street: 'Abay Ave 42', shoppingMallName: 'stale mall' }).shopping_mall_name === null);
check('Mall project keeps its own shopping_mall_name',
  toDB({ storeCode: 'X', locationType: 'Mall', shoppingMallName: 'MEGA' }).shopping_mall_name === 'MEGA');
check('no locationType leaves both shopping_mall_name and street untouched (legacy rows)',
  (() => {
    const out = toDB({ storeCode: 'X', shoppingMallName: 'Legacy Mall', street: null });
    return out.shopping_mall_name === 'Legacy Mall' && out.street === null;
  })());

console.log('\ntoDB — "unknown ≠ zero" round-trip for numeric fields');

check('salesAreaSqm of 0 is written as 0, not null', toDB({ storeCode: 'X', salesAreaSqm: 0 }).sales_area_sqm === 0);
check('salesAreaSqm of "" is written as null', toDB({ storeCode: 'X', salesAreaSqm: '' }).sales_area_sqm === null);
check('budget of 0 is written as 0, not null', toDB({ storeCode: 'X', budget: 0 }).budget === 0);
check('unset budget is written as null', toDB({ storeCode: 'X' }).budget === null);
check('actualCost of 0 is written as 0, not null', toDB({ storeCode: 'X', actualCost: 0 }).actual_cost === 0);
check('unset actualCost is written as null', toDB({ storeCode: 'X' }).actual_cost === null);
check('clearing actualCost to "" is written as null (intentional clear, not a stale value)',
  toDB({ storeCode: 'X', actualCost: '' }).actual_cost === null);
check('a real actualCost value round-trips unchanged', toDB({ storeCode: 'X', actualCost: 525000 }).actual_cost === 525000);
check('new-project serialization removes duplicate scope zone-area numbers', (() => {
  const out = toDB({
    storeCode: 'X',
    salesAreaSqm: 850,
    backOfHouseAreaSqm: 180,
    scope: { zones: ['common', 'sales', 'boh'], zoneAreas: { sales: 850, boh: 180 } },
  });
  return JSON.stringify(out.scope) === JSON.stringify({ zones: ['common', 'sales', 'boh'] });
})());
check('legacy update serialization preserves explicit historical scope zone areas', (() => {
  const scope = { zones: ['common', 'sales', 'boh'], zoneAreas: { sales: 700, boh: 300 } };
  const out = toDB({ storeCode: 'X', scope }, { preserveLegacyZoneAreas: true });
  return JSON.stringify(out.scope) === JSON.stringify(scope);
})());

console.log('\ntoDB — forecast fields are never written by a normal save');

check('constructionCompletionDate / forecastOpeningDate are absent from the create/update payload', (() => {
  const out = toDB({ storeCode: 'X', constructionCompletionDate: '2026-01-01', forecastOpeningDate: '2026-01-05' });
  return !('construction_completion_date' in out) && !('forecast_opening_date' in out);
})());

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
if (fail > 0) process.exit(1);
