// certifyCreateContractorManagedProject.mjs — Simplification Phase 3D.2 DB/
// security certification for create_contractor_managed_project()
// (052_create_contractor_managed_project.sql).
//
// Real authenticated supabase-js clients (signInWithPassword) for every RPC
// call — never the service-role client for the calls being certified, since
// the whole point is proving authorization inside the RPC body actually
// holds. Ground truth (setup and verification) uses direct psql, bypassing
// RLS entirely, same pattern as every other DB cert script in this repo.
//
// Run: node scripts/certification/certifyCreateContractorManagedProject.mjs
// (after: npm run cert:reset:contractor-managed-project)

import { randomUUID } from 'node:crypto';
import { psql, queryOne, countRows, signInAs, anonClient, makeReporter, requireCertificationEnvironment } from './lib.mjs';
import { getLocalFixturePassword } from './fixturePassword.mjs';

await requireCertificationEnvironment();

const PASSWORD = getLocalFixturePassword();
const r = makeReporter('Create Contractor-Managed Project certification (Simplification Phase 3D.2)');

// Two real, distinct active Scope WPs from the certified retail-fitout-v2
// template (schemaVersion 1) — never hardcoded 91-WP assumptions beyond
// "these two ids exist in the fixture's active template", the same
// assumption every other cert script in this repo already makes about the
// fixed retail-fitout-v2 catalog.
const WP_1 = 'common.demolition.strip_out';
const WP_2 = 'common.demolition.structural';
const WP_UNKNOWN = 'totally.fake.wp';

const createdStoreCodes = [];

function callRpc(client, project, scopeWpIds, clientRequestId = randomUUID()) {
  return client.rpc('create_contractor_managed_project', {
    p_project: project,
    p_scope_wp_ids: scopeWpIds,
    p_client_request_id: clientRequestId,
  });
}

function projectPayload(storeCode, overrides = {}) {
  createdStoreCodes.push(storeCode);
  return {
    storeCode,
    shoppingMallName: 'Cert Test Mall',
    country: 'UAE',
    constructionStartDate: '2027-01-01',
    targetOpeningDate: '2027-06-01',
    ...overrides,
  };
}

try {
  const pmA = await signInAs('pm-a-assigned@cert.local', PASSWORD);
  const pmAUnassigned = await signInAs('pm-a-unassigned@cert.local', PASSWORD);
  const adminA = await signInAs('admin-a@cert.local', PASSWORD);
  const contractorA = await signInAs('contractor-a-assigned@cert.local', PASSWORD);
  const viewerA = await signInAs('viewer-a@cert.local', PASSWORD);
  const pmB = await signInAs('pm-b@cert.local', PASSWORD);

  r.section('1. PM allowed: valid creation produces a fully-initialized CONTRACTOR_MANAGED project');
  let projectAId;
  {
    const storeCode = `3D2-PM-${randomUUID().slice(0, 8)}`;
    const { data, error } = await callRpc(pmA, projectPayload(storeCode), [WP_1, WP_2]);
    r.check('RPC succeeds for an authorized PM', !error, error?.message);
    r.check('response is not a replay on first call', data?.idempotentReplay !== true);
    r.check('ownership is explicitly CONTRACTOR_MANAGED', data?.schedule_ownership_mode === 'CONTRACTOR_MANAGED');
    r.check('template_id was resolved (never null, never client-supplied)', !!data?.template_id);
    r.check('materializedCount matches the number of supplied Scope WPs', data?.materializedCount === 2);
    projectAId = data?.id;

    const rowCount = countRows('project_gantt_tasks', `project_id = ${projectAId}`);
    r.check('exactly one project_gantt_tasks row per active Scope WP', rowCount === 2);

    const nullDates = queryOne(
      `SELECT COUNT(*) FROM public.project_gantt_tasks WHERE project_id = ${projectAId} AND planned_start IS NULL AND planned_end IS NULL AND duration_days IS NULL AND NOT is_archived;`
    );
    r.check('every materialized row has null planned_start/planned_end/duration_days', nullDates === '2');

    const outOfScope = countRows('project_gantt_tasks', `project_id = ${projectAId} AND wp_id NOT IN ('${WP_1}', '${WP_2}')`);
    r.check('no schedule row exists outside the supplied Scope', outOfScope === 0);

    const versionCount = countRows('project_schedule_versions', `project_id = ${projectAId}`);
    r.check('zero project_schedule_versions rows exist for a freshly created project', versionCount === 0);

    const lifecycle = queryOne(`SELECT public.contractor_schedule_lifecycle_status(${projectAId});`);
    r.check('contractor schedule lifecycle is DRAFT', lifecycle === 'DRAFT');

    const scopeRow = queryOne(`SELECT company_id FROM public.projects WHERE id = ${projectAId};`);
    r.check('company_id resolved to the caller\'s own company', scopeRow === 'company-a');
  }

  r.section('1b. Regression (054): an explicit `scope: null` key in the payload — the exact shape projectService.js\'s real createContractorManagedProject() always sends when no Scope is supplied — never persists as a JSONB null scalar');
  {
    const storeCode = `3D2-NULLFIX-${randomUUID().slice(0, 8)}`;
    const { data, error } = await callRpc(pmA, projectPayload(storeCode, { scope: null }), [WP_1]);
    r.check('RPC succeeds', !error, error?.message);
    const isSqlNull = queryOne(`SELECT (scope IS NULL) FROM public.projects WHERE id = ${data?.id};`);
    r.check('scope column is a true SQL NULL, not a JSONB null scalar (051\'s Scope-mutation lock trigger only fires on a REAL change — a jsonb null scalar IS DISTINCT FROM a true SQL NULL, so this must never persist)', isSqlNull === 't');
    const jsonbType = queryOne(`SELECT jsonb_typeof(scope) FROM public.projects WHERE id = ${data?.id};`);
    r.check('jsonb_typeof(scope) is null (no value at all), confirming there is no jsonb null scalar stored', jsonbType === null);
  }

  r.section('2. Admin allowed: can_create_project() already permits admin/pm — same rule this RPC reuses');
  {
    const storeCode = `3D2-ADMIN-${randomUUID().slice(0, 8)}`;
    const { data, error } = await callRpc(adminA, projectPayload(storeCode), [WP_1]);
    r.check('RPC succeeds for an authorized Admin', !error, error?.message);
    r.check('ownership is explicitly CONTRACTOR_MANAGED', data?.schedule_ownership_mode === 'CONTRACTOR_MANAGED');
  }

  r.section('3. Empty Scope -> rejected, nothing committed');
  {
    const storeCode = `3D2-EMPTY-${randomUUID().slice(0, 8)}`;
    const { error } = await callRpc(pmA, projectPayload(storeCode), []);
    r.check('empty Scope is rejected', !!error);
    r.check('rejection is EMPTY_SCOPE', /EMPTY_SCOPE/.test(error?.message || ''));
    r.check('zero project row committed', countRows('projects', `store_code = '${storeCode}'`) === 0);
  }

  r.section('4. Invalid/foreign WP id -> rejected, nothing committed (atomic rollback)');
  {
    const storeCode = `3D2-BADWP-${randomUUID().slice(0, 8)}`;
    const { error } = await callRpc(pmA, projectPayload(storeCode), [WP_1, WP_UNKNOWN]);
    r.check('a WP id outside the resolved template is rejected', !!error);
    r.check('rejection is WORK_PACKAGE_OUT_OF_TEMPLATE', /WORK_PACKAGE_OUT_OF_TEMPLATE/.test(error?.message || ''));
    r.check('zero project row committed', countRows('projects', `store_code = '${storeCode}'`) === 0);
    r.check('zero schedule rows committed for the valid WP either (whole batch rolled back)',
      countRows('project_gantt_tasks', `wp_id = '${WP_1}' AND project_id NOT IN (SELECT id FROM public.projects)`) === 0);
  }

  r.section('5. Duplicate WP id in the same batch -> rejected, nothing committed');
  {
    const storeCode = `3D2-DUPWP-${randomUUID().slice(0, 8)}`;
    const { error } = await callRpc(pmA, projectPayload(storeCode), [WP_1, WP_1]);
    r.check('a duplicated WP id is rejected', !!error);
    r.check('rejection is DUPLICATE_WORK_PACKAGE', /DUPLICATE_WORK_PACKAGE/.test(error?.message || ''));
    r.check('zero project row committed', countRows('projects', `store_code = '${storeCode}'`) === 0);
  }

  r.section('6. Project-code conflict -> second create rejected, only one project exists');
  {
    const storeCode = `3D2-CONFLICT-${randomUUID().slice(0, 8)}`;
    const first = await callRpc(pmA, projectPayload(storeCode), [WP_1]);
    r.check('first create succeeds', !first.error, first.error?.message);
    const second = await callRpc(pmA, projectPayload(storeCode), [WP_1], randomUUID());
    r.check('second create with the SAME store code (different client_request_id) is rejected', !!second.error);
    r.check('rejection is PROJECT_CODE_CONFLICT', /PROJECT_CODE_CONFLICT/.test(second.error?.message || ''));
    r.check('exactly one project exists with this store code', countRows('projects', `store_code = '${storeCode}'`) === 1);
  }

  r.section('7. Idempotent replay: same clientRequestId returns the same project, no duplicate');
  {
    const storeCode = `3D2-REPLAY-${randomUUID().slice(0, 8)}`;
    const clientRequestId = randomUUID();
    const first = await callRpc(pmA, projectPayload(storeCode), [WP_1, WP_2], clientRequestId);
    r.check('first call succeeds', !first.error, first.error?.message);
    r.check('first call is not reported as a replay', first.data?.idempotentReplay !== true);

    const replay = await callRpc(pmA, projectPayload(storeCode), [WP_1, WP_2], clientRequestId);
    r.check('replay succeeds (does not error)', !replay.error, replay.error?.message);
    r.check('replay is reported as a replay', replay.data?.idempotentReplay === true);
    r.check('replay returns the SAME project id', replay.data?.id === first.data?.id);

    r.check('exactly one project row exists', countRows('projects', `store_code = '${storeCode}'`) === 1);
    r.check('exactly two schedule rows exist (not duplicated)', countRows('project_gantt_tasks', `project_id = ${first.data.id}`) === 2);
    const ledgerCount = queryOne(
      `SELECT COUNT(*) FROM public.write_command_requests WHERE operation = 'project.create_contractor_managed' AND client_request_id = '${clientRequestId}';`
    );
    r.check('exactly one command ledger row exists for this client_request_id', ledgerCount === '1');
  }

  r.section('8. Concurrency: same clientRequestId raced concurrently -> exactly one project created');
  {
    const storeCode = `3D2-RACE-SAME-${randomUUID().slice(0, 8)}`;
    const clientRequestId = randomUUID();
    const payload = projectPayload(storeCode);
    const [a, b] = await Promise.all([
      callRpc(pmA, payload, [WP_1], clientRequestId),
      callRpc(pmA, payload, [WP_1], clientRequestId),
    ]);
    r.check('both concurrent calls resolve without a raw/unexpected error', !a.error && !b.error, (a.error || b.error)?.message);
    r.check('both calls agree on the same project id', a.data?.id === b.data?.id);
    r.check('at least one of the two is reported as a replay (they could not both be "first")',
      a.data?.idempotentReplay === true || b.data?.idempotentReplay === true);
    r.check('exactly one project row exists for this store code', countRows('projects', `store_code = '${storeCode}'`) === 1);
  }

  r.section('9. Concurrency: different clientRequestIds, same project code, raced concurrently -> at most one project created');
  {
    const storeCode = `3D2-RACE-DIFF-${randomUUID().slice(0, 8)}`;
    const payload = projectPayload(storeCode);
    const results = await Promise.all([
      callRpc(pmA, payload, [WP_1], randomUUID()),
      callRpc(pmA, payload, [WP_1], randomUUID()),
    ]);
    const successes = results.filter(res => !res.error);
    const failures = results.filter(res => res.error);
    r.check('exactly one of the two concurrent different-request-id creates succeeds', successes.length === 1);
    r.check('the other is rejected as a project-code conflict', failures.length === 1 && /PROJECT_CODE_CONFLICT/.test(failures[0].error?.message || ''));
    r.check('exactly one project row exists for this store code', countRows('projects', `store_code = '${storeCode}'`) === 1);
  }

  r.section('10. Authorization: Contractor denied');
  {
    const storeCode = `3D2-AUTHZ-CONTRACTOR-${randomUUID().slice(0, 8)}`;
    const { error } = await callRpc(contractorA, projectPayload(storeCode), [WP_1]);
    r.check('Contractor is rejected', !!error);
    r.check('rejection is the authorization failure', /NOT_AUTHORIZED/.test(error?.message || ''));
    r.check('zero project row committed', countRows('projects', `store_code = '${storeCode}'`) === 0);
  }

  r.section('11. Authorization: Viewer denied');
  {
    const storeCode = `3D2-AUTHZ-VIEWER-${randomUUID().slice(0, 8)}`;
    const { error } = await callRpc(viewerA, projectPayload(storeCode), [WP_1]);
    r.check('Viewer is rejected', !!error);
    r.check('rejection is the authorization failure', /NOT_AUTHORIZED/.test(error?.message || ''));
  }

  r.section('12. Authorization: unauthenticated caller denied');
  {
    const storeCode = `3D2-AUTHZ-ANON-${randomUUID().slice(0, 8)}`;
    const { error } = await callRpc(anonClient(), projectPayload(storeCode), [WP_1]);
    r.check('unauthenticated caller is rejected', !!error);
  }

  r.section('13. Authorization: cross-company PM denied (explicit foreign companyId)');
  {
    const storeCode = `3D2-AUTHZ-CROSSCO-${randomUUID().slice(0, 8)}`;
    const { error } = await callRpc(pmB, projectPayload(storeCode, { companyId: 'company-a' }), [WP_1]);
    r.check('PM from company-b explicitly targeting company-a is rejected', !!error);
    r.check('rejection is the authorization failure', /NOT_AUTHORIZED/.test(error?.message || ''));
    r.check('zero project row committed', countRows('projects', `store_code = '${storeCode}'`) === 0);
  }

  r.section('14. Authorization: PM unassigned to any project can still create (creation right, not project-membership)');
  {
    const storeCode = `3D2-AUTHZ-PMUNASSIGNED-${randomUUID().slice(0, 8)}`;
    const { data, error } = await callRpc(pmAUnassigned, projectPayload(storeCode), [WP_1]);
    r.check('a same-company PM with no prior project assignment can still create (matches can_create_project() semantics)', !error, error?.message);
    r.check('ownership is explicitly CONTRACTOR_MANAGED', data?.schedule_ownership_mode === 'CONTRACTOR_MANAGED');
  }

  r.section('15. No template/company id is ever accepted from the client for template selection');
  {
    // The RPC signature has no template_id parameter at all — template
    // resolution is entirely server-side, keyed off the authorization-
    // checked company_id. This is verified structurally (the call above
    // never passes a template id and still resolves one), not by trying to
    // "guess" an id the function signature has no slot for.
    r.check('create_contractor_managed_project has exactly 3 parameters (p_project, p_scope_wp_ids, p_client_request_id) — no client-supplied template/ownership input surface exists',
      queryOne(`SELECT pronargs FROM pg_proc WHERE proname = 'create_contractor_managed_project';`) === '3');
  }

  r.section('16. AUTO_GENERATED path is unaffected by this certification run');
  {
    const autoCount = countRows('projects', "schedule_ownership_mode = 'AUTO_GENERATED'");
    r.check('at least the pre-existing AUTO_GENERATED fixture projects are still present and untouched', Number(autoCount) >= 1);
  }
} finally {
  if (createdStoreCodes.length > 0) {
    const codeList = createdStoreCodes.map(c => `'${c}'`).join(',');
    psql(`DELETE FROM public.project_gantt_tasks WHERE project_id IN (SELECT id FROM public.projects WHERE store_code IN (${codeList}));`);
    psql(`DELETE FROM public.write_command_requests WHERE project_id IN (SELECT id FROM public.projects WHERE store_code IN (${codeList}));`);
    psql(`DELETE FROM public.projects WHERE store_code IN (${codeList});`);
  }
}

const { fail } = r.summary();
process.exit(fail === 0 ? 0 : 1);
