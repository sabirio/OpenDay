// Import Foundation v1 Phase 2 security + integrity certification (IMP-01..IMP-14).
// Every call here hits the REAL commit_project_import_batch RPC through a REAL
// authenticated client (never the service-role key for the "acting" calls),
// then verifies actual persisted state via direct psql ground truth — the
// same pattern as certifySnagLifecycleSecurity.mjs.
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
const r = makeReporter('Import Foundation v1 Phase 2 certification (IMP-01..IMP-14)');

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

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main();
