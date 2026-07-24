// planProjectImport.test.mjs - P0 Import Foundation v1 Phase 1: dry-run/plan engine tests.
// Run: node src/core/import/planProjectImport.test.mjs
import { planProjectImport } from './planProjectImport.js';
import { HISTORICAL_HEADERS, HISTORICAL_MAPPING } from './importTestFixtures.mjs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

function row(overrides = {}) {
  const base = { code: 'KZ001', mall: 'Mega Center', country: 'Kazakhstan', city: 'Almaty', sqm: '1250', type: 'New Opening', start: '2024-01-15', opening: '2024-11-01', gc: 'BuildCo', email: '', locationType: 'Mall' };
  const merged = { ...base, ...overrides };
  return [merged.code, merged.mall, merged.country, merged.city, merged.sqm, merged.type, merged.start, merged.opening, merged.gc, merged.email, merged.locationType];
}

console.log('\nplanProjectImport - new row -> CREATE (test 26)');
{
  const plan = planProjectImport({ headers: HISTORICAL_HEADERS, rows: [row({ code: 'KZ200' })], mapping: HISTORICAL_MAPPING, existingProjects: [] });
  check('a clean new row plans as CREATE', plan.rows[0].action === 'CREATE');
  check('CREATE row has no errors', plan.rows[0].errors.length === 0);
}

console.log('\nplanProjectImport - existing identity -> SKIP (test 27a)');
{
  const plan = planProjectImport({ headers: HISTORICAL_HEADERS, rows: [row({ code: 'KZ201' })], mapping: HISTORICAL_MAPPING, existingProjects: [{ storeCode: 'KZ201' }] });
  check('a row matching an existing project plans as SKIP, not CREATE or a silent overwrite', plan.rows[0].action === 'SKIP');
  check('SKIP carries an informational warning, not a blocking error', plan.rows[0].errors.length === 0 && plan.rows[0].warnings.some(w => w.code === 'EXISTING_PROJECT_SKIPPED'));
  check('existing-identity matching is case-insensitive', planProjectImport({ headers: HISTORICAL_HEADERS, rows: [row({ code: 'kz201' })], mapping: HISTORICAL_MAPPING, existingProjects: [{ storeCode: 'KZ201' }] }).rows[0].action === 'SKIP');
}

console.log('\nplanProjectImport - existing identity -> BLOCK option (test 27b, via a row that is ALSO otherwise invalid)');
{
  // Errors take precedence over an existing-project match: the row is
  // blocked for its own defect, not silently skipped as "already exists".
  const plan = planProjectImport({ headers: HISTORICAL_HEADERS, rows: [row({ code: 'KZ202', sqm: 'garbage' })], mapping: HISTORICAL_MAPPING, existingProjects: [{ storeCode: 'KZ202' }] });
  check('an invalid row matching an existing project is BLOCKed (validation takes precedence over skip)', plan.rows[0].action === 'BLOCK');
}

console.log('\nplanProjectImport - duplicate within import -> BLOCK (test 28)');
{
  const plan = planProjectImport({
    headers: HISTORICAL_HEADERS,
    rows: [row({ code: 'KZ001' }), row({ code: 'KZ002' }), row({ code: 'KZ001' })],
    mapping: HISTORICAL_MAPPING,
    existingProjects: [],
  });
  check('both occurrences of a code duplicated within the file are BLOCKed, not just the second', plan.rows[0].action === 'BLOCK' && plan.rows[2].action === 'BLOCK');
  check('the non-duplicated row in the same file still plans normally', plan.rows[1].action === 'CREATE');
  check('duplicate rows carry a structured DUPLICATE_IN_FILE error', plan.rows[0].errors.some(e => e.code === 'DUPLICATE_IN_FILE'));
  check('classic example from the architecture doc (KZ001, KZ002, KZ001) matches exactly', plan.rows.map(r => r.action).join(',') === 'BLOCK,CREATE,BLOCK');
}

console.log('\nplanProjectImport - invalid row -> BLOCK (test 29)');
{
  const plan = planProjectImport({ headers: HISTORICAL_HEADERS, rows: [row({ code: '' })], mapping: HISTORICAL_MAPPING, existingProjects: [] });
  check('a row with a validation error plans as BLOCK', plan.rows[0].action === 'BLOCK');
}

console.log('\nplanProjectImport - warnings do not become silent errors (test 30)');
{
  const plan = planProjectImport({ headers: HISTORICAL_HEADERS, rows: [row({ code: 'KZ203', type: 'Demolition' })], mapping: HISTORICAL_MAPPING, existingProjects: [] });
  check('a row with only a warning (unrecognized project type) still plans as CREATE, not BLOCK', plan.rows[0].action === 'CREATE');
  check('the warning is still visible on the row', plan.rows[0].warnings.some(w => w.code === 'UNKNOWN_PROJECT_TYPE'));
  check('summary.warnings counts it even though the row is not blocked', plan.summary.warnings === 1);
}

console.log('\nplanProjectImport - summary counts exactly match row plans (test 31)');
{
  const plan = planProjectImport({
    headers: HISTORICAL_HEADERS,
    rows: [
      row({ code: 'KZ300' }),                       // CREATE
      row({ code: 'KZ301' }),                       // SKIP (existing)
      row({ code: '' }),                             // BLOCK (missing code)
      row({ code: 'KZ302', type: 'Demolition' }),    // CREATE, with a warning
    ],
    mapping: HISTORICAL_MAPPING,
    existingProjects: [{ storeCode: 'KZ301' }],
  });
  check('create + skip + blocked sums to total exactly', plan.summary.create + plan.summary.skip + plan.summary.blocked === plan.summary.total);
  check('total matches the number of input rows', plan.summary.total === 4);
  check('bucket counts match the expected outcome for each row', plan.summary.create === 2 && plan.summary.skip === 1 && plan.summary.blocked === 1);
  check('every row in the plan has an outcome accounted for in the summary', plan.rows.length === plan.summary.total);
}

console.log('\nplanProjectImport - planning is deterministic for identical inputs (test 32)');
{
  const input = { headers: HISTORICAL_HEADERS, rows: [row({ code: 'KZ400' }), row({ code: 'KZ401' })], mapping: HISTORICAL_MAPPING, existingProjects: [{ storeCode: 'KZ401' }] };
  const first = planProjectImport(input);
  const second = planProjectImport(input);
  check('two runs over identical input produce byte-identical output', JSON.stringify(first) === JSON.stringify(second));
}

console.log('\nplanProjectImport - unsupported historical columns are surfaced, not silently discarded');
{
  // As of migration 037 every previously-identified Category C gap (actual
  // dates, budget, actual cost, location/store type) has a real catalog
  // entry (see projectImportFieldMap.js's now-empty FUTURE_CANONICAL_FIELDS)
  // — so a genuinely unmapped, unrecognized header must NOT be reported as
  // "unsupported" (that would be a stale/incorrect claim); it is simply
  // unmapped, exactly like any other column with no known meaning at all.
  const headersWithUnknown = [...HISTORICAL_HEADERS, 'Loyalty Program Notes'];
  const plan = planProjectImport({
    headers: headersWithUnknown,
    rows: [[...row({ code: 'KZ500' }), 'internal notes, not a canonical field']],
    mapping: HISTORICAL_MAPPING, // the unknown column is intentionally left unmapped by the (simulated) user
    existingProjects: [],
  });
  check('a genuinely unmapped, uncatalogued column is not reported in unsupportedColumns (no known gap remains)', plan.unsupportedColumns.length === 0);
  check('the unmapped column never appears anywhere in the normalized row output', !JSON.stringify(plan.rows[0]).includes('internal notes'));
}

console.log('\nplanProjectImport - a conflicting mapping refuses to plan rather than guessing (mapping-level ambiguity)');
{
  const conflictingMapping = { ...HISTORICAL_MAPPING, City: 'store_size_sqm' }; // City AND Sqm both claim store_size_sqm
  const plan = planProjectImport({ headers: HISTORICAL_HEADERS, rows: [row()], mapping: conflictingMapping, existingProjects: [] });
  check('plan.ok is false when the confirmed mapping is ambiguous', plan.ok === false);
  check('mappingErrors names the conflicting canonical field and both headers', plan.mappingErrors[0].canonicalField === 'store_size_sqm' && plan.mappingErrors[0].headers.includes('Sqm') && plan.mappingErrors[0].headers.includes('City'));
  check('no rows are planned when the mapping itself is unresolved', plan.rows.length === 0);
}

console.log('\nplanProjectImport - realistic mixed historical-tracker batch (project/role scope unchanged: pure function, no auth/company concept at all)');
{
  const plan = planProjectImport({
    headers: HISTORICAL_HEADERS,
    rows: [
      row({ code: 'KZ600' }),
      row({ code: 'kz601', mall: '  Dostyk Plaza  ', country: 'UAE', sqm: '1 250 m²', start: '15 March 2024', opening: '03/04/2025' }),
      row({ code: 'KZ600' }), // duplicate of the first
    ],
    mapping: HISTORICAL_MAPPING,
    existingProjects: [{ storeCode: 'KZ999' }],
  });
  check('a realistic mixed batch produces the expected mixture of outcomes', plan.rows[0].action === 'BLOCK' && plan.rows[2].action === 'BLOCK' && plan.rows[1].action === 'BLOCK');
  check('row 2 is blocked specifically for its own ambiguous date, independent of the duplicate concern', plan.rows[1].errors.some(e => e.code === 'AMBIGUOUS_DATE'));
  check('planProjectImport never touches a database, network client, or auth context (pure function of its arguments only)',
    !planProjectImport.toString().includes('supabase') && !planProjectImport.toString().includes('fetch('));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
