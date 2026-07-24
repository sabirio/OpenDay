// Import Foundation v1 Phase 2 security + integrity certification (IMP-01..IMP-33).
// Every call here hits the REAL commit_project_import_batch RPC through a REAL
// authenticated client (never the service-role key for the "acting" calls),
// then verifies actual persisted state via direct psql ground truth — the
// same pattern as certifySnagLifecycleSecurity.mjs.
//
// IMP-15 onward (added by migration 039, integrity hardening): forged direct
// RPC attacks that bypass Phase 1 entirely (constructed by hand here, never
// via planProjectImport), a real concurrent-duplicate-creation race, and the
// proven (company_id, store_code) cross-company identity scope.
// Run: node scripts/certification/certifyImportPhase2.mjs

import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'node:path';
import { countRows, makeReporter, psql, queryOne, requireCertificationEnvironment, signInAs } from './lib.mjs';
import { getLocalFixturePassword } from './fixturePassword.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { planProjectImport } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'src', 'core', 'import', 'planProjectImport.js')));

await requireCertificationEnvironment();

const PASSWORD = getLocalFixturePassword();
const r = makeReporter('Import Foundation v1 Phase 2 certification (IMP-01..IMP-33)');

const HEADERS = ['Store Code', 'Mall', 'Country', 'City', 'Location Type', 'Project Type'];
const MAPPING = {
  'Store Code': 'store_code', Mall: 'shopping_mall_name', Country: 'country', City: 'city',
  'Location Type': 'location_type', 'Project Type': 'project_type',
};

function buildPlan(rows, existingProjects = []) {
  return planProjectImport({ headers: HEADERS, rows, mapping: MAPPING, existingProjects });
}

async function commit(client, { companyId, planRows, clientRequestId, sourceFilename = 'IMP-cert.csv' }) {
  return client.rpc('commit_project_import_batch', {
    p_company_id: companyId,
    p_rows: planRows,
    p_client_request_id: clientRequestId,
    p_source_filename: sourceFilename,
    p_mapping_snapshot: MAPPING,
  });
}

// A hand-built, otherwise-fully-valid CREATE row for the forged-RPC section
// below — deliberately constructed WITHOUT going through planProjectImport,
// simulating a caller that bypasses Phase 1 entirely and talks to the RPC
// directly. `errors: []` and `action: 'CREATE'` are exactly what a genuine
// Phase 1 CREATE row would also look like, so these scenarios only exercise
// the migration-039 integrity floor, never the pre-existing action/error
// consistency check (already covered by IMP-09/IMP-10).
function forgedCreateRow(storeCode, overrides = {}) {
  const normalized = {
    store_code: storeCode, country: 'Kazakhstan', city: 'Almaty', location_type: 'Mall',
    shopping_mall_name: 'Hardening Test Mall', project_type: 'New Opening',
    ...overrides,
  };
  for (const key of Object.keys(normalized)) {
    if (normalized[key] === undefined) delete normalized[key];
  }
  return [{ sourceRow: 2, action: 'CREATE', normalized, errors: [], warnings: [] }];
}

async function main() {
  const adminA = await signInAs('admin-a@cert.local', PASSWORD);
  const pmAAssigned = await signInAs('pm-a-assigned@cert.local', PASSWORD);
  const viewerA = await signInAs('viewer-a@cert.local', PASSWORD);
  const contractorAAssigned = await signInAs('contractor-a-assigned@cert.local', PASSWORD);
  const pmB = await signInAs('pm-b@cert.local', PASSWORD);

  // ── IMP-01: Admin imports into their own company (baseline: must work) ──
  r.section('IMP-01: Admin (company-a) commits a clean CREATE batch into company-a (baseline: this must work)');
  const planA = buildPlan([['IMP-A001', 'IMP Mall One', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening']]);
  r.check('fixture plan produced a CREATE row', planA.rows[0].action === 'CREATE');
  const { data: imp01, error: imp01Err } = await commit(adminA, { companyId: 'company-a', planRows: planA.rows, clientRequestId: randomUUID() });
  r.check('accepted', !imp01Err, JSON.stringify(imp01Err));
  r.check('summary reports one committed row', imp01?.summary?.committed === 1);
  r.check('row outcome is COMMITTED with a real project id', imp01?.rows?.[0]?.outcome === 'COMMITTED' && imp01?.rows?.[0]?.projectId != null);
  r.check('project actually persisted with the correct company scope (ground truth)',
    psql(`SELECT company_id FROM projects WHERE store_code='IMP-A001';`) === 'company-a');
  r.check('an import_jobs audit row was written with matching counts',
    psql(`SELECT committed_count FROM import_jobs WHERE id=${imp01.importJobId};`) === '1');

  // ── IMP-02: PM (assigned, company-a) can also legitimately import into company-a ──
  r.section('IMP-02: PM (company-a) commits into company-a (baseline: this must work)');
  const planA2 = buildPlan([['IMP-A002', 'IMP Mall Two', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening']]);
  const { data: imp02, error: imp02Err } = await commit(pmAAssigned, { companyId: 'company-a', planRows: planA2.rows, clientRequestId: randomUUID() });
  r.check('accepted', !imp02Err, JSON.stringify(imp02Err));
  r.check('committed', imp02?.summary?.committed === 1);

  // ── IMP-03: Viewer denied entirely ──
  r.section('IMP-03: Viewer role cannot commit an import batch');
  const planV = buildPlan([['IMP-V001', 'IMP Mall Viewer', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening']]);
  const { error: imp03Err } = await commit(viewerA, { companyId: 'company-a', planRows: planV.rows, clientRequestId: randomUUID() });
  r.check('denied', !!imp03Err, JSON.stringify(imp03Err));
  r.check('error is FORBIDDEN (42501)', imp03Err?.code === '42501' || /IMPORT_FORBIDDEN/.test(imp03Err?.message ?? ''), imp03Err?.message);
  r.check('no project was created (ground truth)', countRows('projects', `store_code='IMP-V001'`) === 0);

  // ── IMP-04: Contractor denied entirely ──
  r.section('IMP-04: Contractor role cannot commit an import batch');
  const planC = buildPlan([['IMP-C001', 'IMP Mall Contractor', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening']]);
  const { error: imp04Err } = await commit(contractorAAssigned, { companyId: 'company-a', planRows: planC.rows, clientRequestId: randomUUID() });
  r.check('denied', !!imp04Err, JSON.stringify(imp04Err));
  r.check('no project was created', countRows('projects', `store_code='IMP-C001'`) === 0);

  // ── IMP-05: PM from a DIFFERENT company cannot import into company-a ──
  r.section('IMP-05: PM (company-b) cannot commit an import batch scoped to company-a');
  const planX = buildPlan([['IMP-X001', 'IMP Mall Cross', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening']]);
  const { error: imp05Err } = await commit(pmB, { companyId: 'company-a', planRows: planX.rows, clientRequestId: randomUUID() });
  r.check('denied', !!imp05Err, JSON.stringify(imp05Err));
  r.check('no project was created', countRows('projects', `store_code='IMP-X001'`) === 0);

  // ── IMP-06: forged/unauthorized company_id (a company neither actor belongs to) ──
  r.section('IMP-06: Admin (company-a) cannot commit into a forged/unrelated company_id');
  const planForged = buildPlan([['IMP-F001', 'IMP Mall Forged', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening']]);
  const { error: imp06Err } = await commit(adminA, { companyId: 'company-nonexistent-forged', planRows: planForged.rows, clientRequestId: randomUUID() });
  r.check('denied', !!imp06Err, JSON.stringify(imp06Err));
  r.check('no project was created', countRows('projects', `store_code='IMP-F001'`) === 0);

  // ── IMP-07: stale CREATE — identity now exists by commit time, never overwritten ──
  r.section('IMP-07: a stale CREATE for an identity that now exists is a CONFLICT, never an overwrite');
  const staleStoreCode = 'IMP-A001'; // already committed in IMP-01
  const beforeMall = psql(`SELECT shopping_mall_name FROM projects WHERE store_code='${staleStoreCode}';`);
  const stalePlan = buildPlan([[staleStoreCode, 'SOMEONE ELSE TRIED TO OVERWRITE THIS', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening']], []); // empty existingProjects simulates a stale client-side Preview
  r.check('the (stale) client-side plan still says CREATE — it never saw the row that was committed after its Preview ran', stalePlan.rows[0].action === 'CREATE');
  const { data: imp07, error: imp07Err } = await commit(adminA, { companyId: 'company-a', planRows: stalePlan.rows, clientRequestId: randomUUID() });
  r.check('the RPC call itself succeeds (conflict is a per-row outcome, not a request failure)', !imp07Err, JSON.stringify(imp07Err));
  r.check('the row outcome is CONFLICT, not COMMITTED', imp07?.rows?.[0]?.outcome === 'CONFLICT');
  r.check('summary reports zero committed for this batch', imp07?.summary?.committed === 0);
  r.check('the original project row is completely untouched (ground truth: mall name unchanged)',
    psql(`SELECT shopping_mall_name FROM projects WHERE store_code='${staleStoreCode}';`) === beforeMall);

  // ── IMP-08: malformed plan ──
  r.section('IMP-08: a malformed plan (not an array) is refused outright');
  const { error: imp08Err } = await adminA.rpc('commit_project_import_batch', {
    p_company_id: 'company-a', p_rows: { not: 'an array' }, p_client_request_id: randomUUID(), p_source_filename: null, p_mapping_snapshot: null,
  });
  r.check('denied', !!imp08Err, JSON.stringify(imp08Err));

  // ── IMP-09: direct attempt to smuggle a BLOCK row as CREATE ──
  r.section('IMP-09: a row carrying validation errors cannot be committed even if its action is forged to CREATE');
  const smuggled = [{ sourceRow: 2, action: 'CREATE', normalized: { store_code: 'IMP-SMUGGLE-1', country: 'Kazakhstan', city: 'Almaty', location_type: 'Mall', shopping_mall_name: 'Smuggled Mall', project_type: 'New Opening' }, errors: [{ field: 'store_code', code: 'FORGED', message: 'this row was actually BLOCKed' }], warnings: [] }];
  const { data: imp09, error: imp09Err } = await commit(adminA, { companyId: 'company-a', planRows: smuggled, clientRequestId: randomUUID() });
  r.check('the RPC call succeeds (rejection is a per-row outcome)', !imp09Err, JSON.stringify(imp09Err));
  r.check('the row outcome is REJECTED_INVALID_ACTION, not COMMITTED', imp09?.rows?.[0]?.outcome === 'REJECTED_INVALID_ACTION');
  r.check('no project was created for the smuggled row', countRows('projects', `store_code='IMP-SMUGGLE-1'`) === 0);

  // ── IMP-10: a CREATE row with no store_code at all is refused, never inserted as a blank identity ──
  r.section('IMP-10: a CREATE row missing store_code is refused server-side, not just client-side');
  const noCode = [{ sourceRow: 3, action: 'CREATE', normalized: { country: 'Kazakhstan', city: 'Almaty', location_type: 'Mall', shopping_mall_name: 'No Code Mall', project_type: 'New Opening' }, errors: [], warnings: [] }];
  const { data: imp10 } = await commit(adminA, { companyId: 'company-a', planRows: noCode, clientRequestId: randomUUID() });
  r.check('rejected server-side', imp10?.rows?.[0]?.outcome === 'REJECTED_INVALID_ACTION');
  r.check('no blank-identity project exists', countRows('projects', `shopping_mall_name='No Code Mall'`) === 0);

  // ── IMP-11: SKIP and BLOCK rows in a real plan never touch the database ──
  r.section('IMP-11: SKIP and BLOCK rows are counted but never committed');
  const mixedPlan = buildPlan(
    [
      ['IMP-A001', 'irrelevant, matches existing', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening'], // SKIP: already exists
      ['', 'no store code', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening'], // BLOCK: missing store_code
      ['IMP-A010', 'IMP Mall Ten', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening'], // CREATE
    ],
    [{ storeCode: 'IMP-A001' }],
  );
  r.check('plan produced SKIP, BLOCK, CREATE respectively', mixedPlan.rows.map(row => row.action).join(',') === 'SKIP,BLOCK,CREATE');
  const { data: imp11 } = await commit(adminA, { companyId: 'company-a', planRows: mixedPlan.rows, clientRequestId: randomUUID() });
  r.check('summary matches: 1 skip, 1 blocked, 1 committed', imp11.summary.skip === 1 && imp11.summary.blocked === 1 && imp11.summary.committed === 1);
  r.check('the SKIP row outcome is SKIPPED', imp11.rows[0].outcome === 'SKIPPED');
  r.check('the BLOCK row outcome is BLOCKED_IN_PLAN', imp11.rows[1].outcome === 'BLOCKED_IN_PLAN');
  r.check('the CREATE row committed', imp11.rows[2].outcome === 'COMMITTED');
  r.check('the pre-existing project was not touched by the SKIP row (ground truth)',
    psql(`SELECT shopping_mall_name FROM projects WHERE store_code='IMP-A001';`) !== 'irrelevant, matches existing');

  // ── IMP-12: idempotent retry never creates a duplicate project ──
  r.section('IMP-12: resubmitting the same client_request_id replays the original result, never duplicates');
  const idemPlan = buildPlan([['IMP-IDEM-1', 'IMP Idempotent Mall', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening']]);
  const idemRequestId = randomUUID();
  const { data: first } = await commit(adminA, { companyId: 'company-a', planRows: idemPlan.rows, clientRequestId: idemRequestId });
  const { data: second, error: secondErr } = await commit(adminA, { companyId: 'company-a', planRows: idemPlan.rows, clientRequestId: idemRequestId });
  r.check('first call committed', first?.summary?.committed === 1 && first?.idempotentReplay === false);
  r.check('second call (same client_request_id) succeeds and is flagged as a replay', !secondErr && second?.idempotentReplay === true);
  r.check('the replayed response is byte-identical apart from the replay flag', JSON.stringify({ ...first, idempotentReplay: null }) === JSON.stringify({ ...second, idempotentReplay: null }));
  r.check('exactly one project was created, not two (ground truth)', countRows('projects', `store_code='IMP-IDEM-1'`) === 1);

  // ── IMP-13: financial/area/date validation rules already BLOCK at planning time (Phase 1), and the RPC honors that BLOCK rather than re-deriving its own rule ──
  r.section('IMP-13: rows already BLOCKed by Phase 1 validation (money without currency, Street with a mall name) are never committed even when present in a batch');
  const moneyMapping = { ...MAPPING, Budget: 'budget' };
  const moneyPlan = planProjectImport({
    headers: [...HEADERS, 'Budget'],
    rows: [['IMP-MONEY-1', 'IMP Mall Money', 'Kazakhstan', 'Almaty', 'Mall', 'New Opening', '500000']],
    mapping: moneyMapping, existingProjects: [],
  });
  r.check('Phase 1 planning already BLOCKs a budget with no currency', moneyPlan.rows[0].action === 'BLOCK' && moneyPlan.rows[0].errors.some(e => e.code === 'MONEY_WITHOUT_CURRENCY'));
  const { data: imp13 } = await commit(adminA, { companyId: 'company-a', planRows: moneyPlan.rows, clientRequestId: randomUUID() });
  r.check('the RPC honors the existing BLOCK outcome (BLOCKED_IN_PLAN), never re-validating or overriding it', imp13.rows[0].outcome === 'BLOCKED_IN_PLAN');
  r.check('no project was created for the blocked money row', countRows('projects', `store_code='IMP-MONEY-1'`) === 0);

  // ── IMP-14: historical integrity — an imported project has zero fabricated operational records ──
  r.section('IMP-14: an imported historical project has NO fabricated Contractor Report, Site Visit, Snag, or Gantt schedule');
  const importedProjectId = queryOne(`SELECT id FROM projects WHERE store_code='IMP-A001';`);
  r.check('the imported project exists', importedProjectId != null);
  r.check('zero contractor_reports', countRows('contractor_reports', `project_id=${importedProjectId}`) === 0);
  r.check('zero site_visits', countRows('site_visits', `project_id=${importedProjectId}`) === 0);
  r.check('zero snags', countRows('snags', `project_id=${importedProjectId}`) === 0);
  r.check('zero project_gantt_tasks (no fabricated schedule)', countRows('project_gantt_tasks', `project_id=${importedProjectId}`) === 0);
  r.check('gantt_generated_at is null (Gantt was never generated for this historical project)',
    psql(`SELECT COALESCE(gantt_generated_at::text, 'NULL') FROM projects WHERE id=${importedProjectId};`) === 'NULL');

  // ── IMP-15: forged direct RPC input — server-side integrity floor (migration 039) ──
  // Every scenario below is an otherwise-valid CREATE row (action='CREATE',
  // errors=[]) hand-built to bypass Phase 1 entirely, each violating exactly
  // one critical persistence invariant. For each: the RPC call itself must
  // succeed (rejection is a per-row outcome, not a request failure), the row
  // outcome must be REJECTED_INTEGRITY_FLOOR, and — verified independently
  // via direct psql, never trusted from the RPC's own response — zero
  // project rows must exist for that store_code.
  r.section('IMP-15: server-side integrity floor rejects forged CREATE rows that bypass Phase 1 (17 scenarios)');
  const forgedScenarios = [
    ['IMP-FLOOR-01', 'missing country', { country: undefined }],
    ['IMP-FLOOR-02', 'missing city', { city: undefined }],
    ['IMP-FLOOR-03', 'missing project_type', { project_type: undefined }],
    ['IMP-FLOOR-04', 'unsupported location_type', { location_type: 'Airport' }],
    ['IMP-FLOOR-05', 'Mall without mall name', { location_type: 'Mall', shopping_mall_name: undefined }],
    ['IMP-FLOOR-06', 'Street with mall name', { location_type: 'Street', street: '123 Main St', shopping_mall_name: 'Should Not Be Here' }],
    ['IMP-FLOOR-07', 'Street without street address', { location_type: 'Street', shopping_mall_name: undefined }],
    ['IMP-FLOOR-08', 'negative total area', { store_size_sqm: -100 }],
    ['IMP-FLOOR-09', 'negative sales area', { sales_area_sqm: -1 }],
    ['IMP-FLOOR-10', 'negative BOH area', { back_of_house_area_sqm: -1 }],
    ['IMP-FLOOR-11', 'sales area > total area', { store_size_sqm: 100, sales_area_sqm: 200 }],
    ['IMP-FLOOR-12', 'actual completion before actual start', { actual_construction_start_date: '2024-06-01', actual_construction_completion_date: '2024-01-01' }],
    ['IMP-FLOOR-13', 'actual opening before actual start', { actual_construction_start_date: '2024-06-01', actual_opening_date: '2024-01-01' }],
    ['IMP-FLOOR-14', 'negative budget', { budget: -1, currency_code: 'USD' }],
    ['IMP-FLOOR-15', 'negative actual_cost', { actual_cost: -1, currency_code: 'USD' }],
    ['IMP-FLOOR-16', 'budget without currency', { budget: 500000 }],
    ['IMP-FLOOR-17', 'actual_cost without currency', { actual_cost: 500000 }],
  ];
  for (const [storeCode, label, overrides] of forgedScenarios) {
    const row = forgedCreateRow(storeCode, overrides);
    const { data, error } = await commit(adminA, { companyId: 'company-a', planRows: row, clientRequestId: randomUUID() });
    r.check(`[${label}] RPC call succeeds (rejection is a per-row outcome, not a request failure)`, !error, JSON.stringify(error));
    r.check(`[${label}] row outcome is REJECTED_INTEGRITY_FLOOR`, data?.rows?.[0]?.outcome === 'REJECTED_INTEGRITY_FLOOR', JSON.stringify(data?.rows?.[0]));
    r.check(`[${label}] zero project rows created (ground truth, not trusted from the RPC response)`, countRows('projects', `store_code='${storeCode}'`) === 0);
  }
  const { data: floorControl } = await commit(adminA, { companyId: 'company-a', planRows: forgedCreateRow('IMP-FLOOR-CONTROL'), clientRequestId: randomUUID() });
  r.check('a genuinely valid forged-shape row (no violation) still commits — the floor rejects only real violations, not the bypass itself',
    floorControl?.rows?.[0]?.outcome === 'COMMITTED', JSON.stringify(floorControl?.rows?.[0]));

  // ── IMP-16: import_jobs audit correctness for a rejected batch ──
  r.section('IMP-16: import_jobs never claims a rejected row was committed');
  const auditRow = forgedCreateRow('IMP-AUDIT-1', { budget: -1, currency_code: 'USD' });
  const { data: imp16 } = await commit(adminA, { companyId: 'company-a', planRows: auditRow, clientRequestId: randomUUID() });
  r.check('RPC summary reports zero committed', imp16.summary.committed === 0);
  r.check('per-row projectId is absent for the rejected row', imp16.rows[0].projectId == null);
  r.check('import_jobs.committed_count matches (ground truth, not just the RPC response)',
    psql(`SELECT committed_count FROM import_jobs WHERE id=${imp16.importJobId};`) === '0');
  r.check('no project row exists for the rejected store_code', countRows('projects', `store_code='IMP-AUDIT-1'`) === 0);

  // ── IMP-17: concurrent duplicate creation — real parallel race, not sequential calls ──
  r.section('IMP-17: N truly concurrent CREATE attempts for the same identity produce exactly one canonical project');
  const raceStoreCode = 'IMP-RACE-1';
  const raceAttempts = 6; // repeated to make the race meaningful rather than accidentally sequential
  const racePromises = Array.from({ length: raceAttempts }, () =>
    commit(adminA, { companyId: 'company-a', planRows: forgedCreateRow(raceStoreCode), clientRequestId: randomUUID() }),
  );
  const raceResults = await Promise.all(racePromises); // fired together, not awaited one at a time
  const raceOutcomes = raceResults.map(({ data, error }) => error ? `ERROR:${error.message}` : data.rows[0].outcome);
  const committedCount = raceOutcomes.filter(outcome => outcome === 'COMMITTED').length;
  const conflictCount = raceOutcomes.filter(outcome => outcome === 'CONFLICT').length;
  r.check(`exactly one of ${raceAttempts} concurrent attempts committed (outcomes: ${raceOutcomes.join(', ')})`, committedCount === 1);
  r.check(`the remaining ${raceAttempts - 1} attempts are CONFLICT, never a second COMMITTED`, conflictCount === raceAttempts - 1);
  r.check('ground truth: exactly one project row exists for the raced identity', countRows('projects', `store_code='${raceStoreCode}' AND company_id='company-a'`) === 1);

  // ── IMP-18: idempotency and concurrency coexist correctly ──
  r.section('IMP-18: same client_request_id retried concurrently still yields exactly one project (idempotency survives concurrency)');
  const idemRaceStoreCode = 'IMP-IDEM-RACE-1';
  const sharedRequestId = randomUUID();
  const idemRaceResults = await Promise.all([
    commit(adminA, { companyId: 'company-a', planRows: forgedCreateRow(idemRaceStoreCode), clientRequestId: sharedRequestId }),
    commit(adminA, { companyId: 'company-a', planRows: forgedCreateRow(idemRaceStoreCode), clientRequestId: sharedRequestId }),
  ]);
  r.check('both concurrent calls with the same client_request_id succeed without error', idemRaceResults.every(({ error }) => !error), JSON.stringify(idemRaceResults.map(res => res.error)));
  r.check('exactly one of the two is the real commit and one is the idempotent replay', idemRaceResults.filter(({ data }) => data.idempotentReplay === false).length === 1);
  r.check('ground truth: exactly one project row exists, not two', countRows('projects', `store_code='${idemRaceStoreCode}'`) === 1);

  // ── IMP-19: cross-company identity — proven scope is (company_id, store_code), not global ──
  r.section('IMP-19: the same store_code in two different companies coexists (identity is company-scoped, not global)');
  const adminB = await signInAs('admin-b@cert.local', PASSWORD);
  const crossStoreCode = 'IMP-CROSS-1';
  const { data: crossA } = await commit(adminA, { companyId: 'company-a', planRows: forgedCreateRow(crossStoreCode), clientRequestId: randomUUID() });
  const { data: crossB } = await commit(adminB, { companyId: 'company-b', planRows: forgedCreateRow(crossStoreCode), clientRequestId: randomUUID() });
  r.check('company-a commit succeeds', crossA.rows[0].outcome === 'COMMITTED', JSON.stringify(crossA.rows[0]));
  r.check('company-b commit for the SAME store_code also succeeds (different company scope)', crossB.rows[0].outcome === 'COMMITTED', JSON.stringify(crossB.rows[0]));
  r.check('exactly one project row exists in company-a for this store_code', countRows('projects', `store_code='${crossStoreCode}' AND company_id='company-a'`) === 1);
  r.check('exactly one project row exists in company-b for this store_code', countRows('projects', `store_code='${crossStoreCode}' AND company_id='company-b'`) === 1);
  r.check('the two rows are genuinely different projects', crossA.rows[0].projectId !== crossB.rows[0].projectId);

  // ── IMP-20: Project Exchange v1 completion patch (migration 040) — the
  // trusted commit RPC now persists Planned Construction End (construction_
  // end_date), closing the Export -> Excel -> Import round-trip gap. ──
  r.section('IMP-20: commit_project_import_batch persists construction_end_date (Planned Construction End)');
  const plannedDatesRow = forgedCreateRow('IMP-PLANNED-END-1', {
    construction_start_date: '2026-08-01',
    construction_end_date: '2026-11-15',
    target_opening_date: '2026-11-21',
  });
  const { data: imp20, error: imp20Err } = await commit(adminA, { companyId: 'company-a', planRows: plannedDatesRow, clientRequestId: randomUUID() });
  r.check('accepted', !imp20Err, JSON.stringify(imp20Err));
  r.check('row committed', imp20?.rows?.[0]?.outcome === 'COMMITTED', JSON.stringify(imp20?.rows?.[0]));
  r.check('all three planned dates persisted exactly, ground truth (not trusted from the RPC response)',
    psql(`SELECT construction_start_date, construction_end_date, target_opening_date FROM projects WHERE store_code='IMP-PLANNED-END-1';`)
      === '2026-08-01|2026-11-15|2026-11-21');

  // ── IMP-21: a blank construction_end_date persists as NULL, never a
  // fabricated date (unknown ≠ zero, extended to planned dates too). ──
  r.section('IMP-21: an absent construction_end_date persists as NULL, not a fabricated date');
  const noEndDateRow = forgedCreateRow('IMP-PLANNED-END-BLANK-1', { construction_start_date: '2026-08-01' });
  const { data: imp21 } = await commit(adminA, { companyId: 'company-a', planRows: noEndDateRow, clientRequestId: randomUUID() });
  r.check('row committed', imp21?.rows?.[0]?.outcome === 'COMMITTED', JSON.stringify(imp21?.rows?.[0]));
  r.check('construction_end_date is NULL, not 1970-01-01/0/today (ground truth)',
    psql(`SELECT COALESCE(construction_end_date::text, 'NULL') FROM projects WHERE store_code='IMP-PLANNED-END-BLANK-1';`) === 'NULL');

  // ── IMP-22: an invalid planned chronology (construction_end_date before
  // construction_start_date), forged directly at the RPC, still commits —
  // by design, matching the pre-existing target_opening_date precedent.
  // Planned dates are estimates, not observed facts; only ACTUAL date
  // orderings are floor-checked (see IMP-15's actual-date scenarios and
  // migration 040's header comment). This proves the ACTUAL chosen
  // behavior rather than assuming BLOCK. ──
  r.section('IMP-22: a forged invalid planned chronology (end before start) still commits — consistent with the existing target_opening_date precedent, not floor-checked');
  const invalidChronologyRow = forgedCreateRow('IMP-PLANNED-END-INVALID-1', {
    construction_start_date: '2026-11-15',
    construction_end_date: '2026-08-01',
  });
  const { data: imp22, error: imp22Err } = await commit(adminA, { companyId: 'company-a', planRows: invalidChronologyRow, clientRequestId: randomUUID() });
  r.check('the RPC call succeeds (not rejected server-side — this is a deliberate, documented design choice, not an oversight)', !imp22Err, JSON.stringify(imp22Err));
  r.check('the row commits (server integrity floor only guards ACTUAL/observed date impossibilities, not PLANNED estimates)', imp22?.rows?.[0]?.outcome === 'COMMITTED', JSON.stringify(imp22?.rows?.[0]));
  r.check('the invalid chronology is persisted exactly as submitted, ground truth (proves the actual behavior, not assumed)',
    psql(`SELECT construction_start_date, construction_end_date FROM projects WHERE store_code='IMP-PLANNED-END-INVALID-1';`) === '2026-11-15|2026-08-01');

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main();
