// legacyReportEngine.test.mjs — unit tests for AD-003 extracted adapters.
// Uses the same extensionless-import loader pattern as evmEngine.test.mjs
// because legacyReportEngine.js imports from workPackages without a .js extension.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const {
  mapOldToWPStatus,
  deriveWPStatusesFromOldReport,
  mergeOldDerivedStatuses,
} = await import('../legacyReportEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

// ── A) mapOldToWPStatus ────────────────────────────────────────────────────────

console.log('\nA) mapOldToWPStatus');

check('A1: "completed" → Completed',   mapOldToWPStatus('completed')   === 'Completed');
check('A2: "done" → Completed',        mapOldToWPStatus('done')        === 'Completed');
check('A3: "complete" → Completed',    mapOldToWPStatus('complete')    === 'Completed');
check('A4: "Completed" → Completed',   mapOldToWPStatus('Completed')   === 'Completed');

check('A5: "in progress" → In Progress',  mapOldToWPStatus('in progress')  === 'In Progress');
check('A6: "started" → In Progress',      mapOldToWPStatus('started')      === 'In Progress');
check('A7: "active" → In Progress',       mapOldToWPStatus('active')       === 'In Progress');
check('A8: "In Progress" → In Progress',  mapOldToWPStatus('In Progress')  === 'In Progress');

check('A9:  "delayed" → Delayed',  mapOldToWPStatus('delayed')  === 'Delayed');
check('A10: "blocked" → Delayed',  mapOldToWPStatus('blocked')  === 'Delayed');
check('A11: "behind"  → Delayed',  mapOldToWPStatus('behind')   === 'Delayed');

check('A12: "unknown" → null', mapOldToWPStatus('unknown') === null);
check('A13: "" → null',        mapOldToWPStatus('')        === null);
check('A14: null → null',      mapOldToWPStatus(null)      === null);
check('A15: undefined → null', mapOldToWPStatus(undefined) === null);

// ── B) deriveWPStatusesFromOldReport ──────────────────────────────────────────

console.log('\nB) deriveWPStatusesFromOldReport');

// B1: null report → empty object
check('B1: null report → {}',
  JSON.stringify(deriveWPStatusesFromOldReport(null)) === '{}');

// B2: demolitionStatus "Completed"
{
  const r = deriveWPStatusesFromOldReport({ demolitionStatus: 'Completed' });
  check('B2: demolitionStatus → demolition WP', r.demolition?.['Demolition works']?.status === 'Completed');
}

// B3: demolitionStatus unknown → dropped
{
  const r = deriveWPStatusesFromOldReport({ demolitionStatus: 'Pending' });
  check('B3: unknown demolitionStatus → not in result', !r.demolition);
}

// B4: constructionStatuses key maps to WP task
{
  const r = deriveWPStatusesFromOldReport({
    constructionStatuses: { 'Flooring installation': 'done' },
  });
  check('B4: Flooring installation → finishes WP', r.finishes?.['Floor finishes']?.status === 'Completed');
}

// B5: testingStatuses fallback path
{
  const r = deriveWPStatusesFromOldReport({
    testingStatuses: { 'Sprinkler system testing and commissioning': 'in progress' },
  });
  check('B5: testingStatuses fallback → commissioning WP',
    r.commissioning?.['Sprinkler testing & commissioning']?.status === 'In Progress');
}

// B6: handoverStatuses fallback path
{
  const r = deriveWPStatusesFromOldReport({
    handoverStatuses: { 'Staff training': 'completed' },
  });
  check('B6: handoverStatuses → handover WP', r.handover?.['Staff training']?.status === 'Completed');
}

// B7: unknown old key → ignored
{
  const r = deriveWPStatusesFromOldReport({
    constructionStatuses: { 'Some Future Task': 'completed' },
  });
  // No matching entry in OLD_TO_WP_WEEKLY → nothing added beyond demolition
  check('B7: unknown old key → not in result', !r.finishes && !r.construction && !r.mep);
}

// B8: empty report → only demolition omitted (all null statuses dropped)
{
  const r = deriveWPStatusesFromOldReport({});
  check('B8: empty report → {}', JSON.stringify(r) === '{}');
}

// ── C) mergeOldDerivedStatuses ────────────────────────────────────────────────

console.log('\nC) mergeOldDerivedStatuses');

// C1: empty list → {}
check('C1: [] → {}',
  JSON.stringify(mergeOldDerivedStatuses([])) === '{}');

// C2: single derived → same result
{
  const derived = { construction: { 'Partitions & drywall': { status: 'In Progress' } } };
  const r = mergeOldDerivedStatuses([derived]);
  check('C2: single derived → unchanged', r.construction?.['Partitions & drywall']?.status === 'In Progress');
}

// C3: higher score wins — Completed (1) beats In Progress (0.5)
{
  const a = { finishes: { 'Floor finishes': { status: 'In Progress' } } };
  const b = { finishes: { 'Floor finishes': { status: 'Completed'  } } };
  const r = mergeOldDerivedStatuses([a, b]);
  check('C3: Completed beats In Progress', r.finishes?.['Floor finishes']?.status === 'Completed');
}

// C4: order independent — first Completed, then In Progress → still Completed
{
  const a = { finishes: { 'Floor finishes': { status: 'Completed'  } } };
  const b = { finishes: { 'Floor finishes': { status: 'In Progress' } } };
  const r = mergeOldDerivedStatuses([a, b]);
  check('C4: Completed stays when In Progress comes second', r.finishes?.['Floor finishes']?.status === 'Completed');
}

// C5: In Progress (0.5) beats Delayed (0.3)
{
  const a = { mep: { 'HVAC ducts': { status: 'Delayed'     } } };
  const b = { mep: { 'HVAC ducts': { status: 'In Progress' } } };
  const r = mergeOldDerivedStatuses([a, b]);
  check('C5: In Progress beats Delayed', r.mep?.['HVAC ducts']?.status === 'In Progress');
}

// C6: different WPs merged correctly
{
  const a = { finishes: { 'Floor finishes': { status: 'Completed' } } };
  const b = { mep:      { 'HVAC ducts':     { status: 'In Progress' } } };
  const r = mergeOldDerivedStatuses([a, b]);
  check('C6: different WPs both present', r.finishes?.['Floor finishes']?.status === 'Completed'
    && r.mep?.['HVAC ducts']?.status === 'In Progress');
}

// C7: unknown status (score -1 via ?? -1) loses to any known status
{
  const a = { construction: { 'Partitions & drywall': { status: 'SomeUnknown' } } };
  const b = { construction: { 'Partitions & drywall': { status: 'In Progress' } } };
  const r = mergeOldDerivedStatuses([a, b]);
  check('C7: known status beats unknown', r.construction?.['Partitions & drywall']?.status === 'In Progress');
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
