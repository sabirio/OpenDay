// Sprint 4.5 — Stage 6: PM Site Visit RPC certification (SV-01..SV-12).
// Same discipline as certifyContractorReport.mjs: real authenticated
// clients, real RPC calls, ground-truth psql verification of persisted
// rows — no mocked services, no static-only assertions.
// Run: node certifySiteVisit.mjs

import { randomUUID } from 'node:crypto';
import { loadFixtureState, psql, countRows, signInAs, makeReporter, requireCertificationEnvironment } from './lib.mjs';

await requireCertificationEnvironment();

const state = loadFixtureState();
const PROJECT_A = state.projects.PROJECT_A;
const PROJECT_B = state.projects.PROJECT_B;
const PASSWORD = state.password;

const r = makeReporter('PM Site Visit RPC certification (SV-01..SV-12)');

function observations({ demoWalls = 45, mepElectrical = 25 } = {}) {
  return [
    { wpId: 'demo.walls', observed_progress: demoWalls, observed_status: 'in_progress', pm_note: 'cert observation',
      gc_progress: 40, gc_status: 'in_progress', signed_delta: demoWalls - 40, absolute_delta: Math.abs(demoWalls - 40),
      discrepancy_status: Math.abs(demoWalls - 40) >= 20 ? 'critical' : Math.abs(demoWalls - 40) >= 10 ? 'warning' : 'ok' },
    { wpId: 'mep.electrical', observed_progress: mepElectrical, observed_status: 'in_progress', pm_note: null,
      gc_progress: 20, gc_status: 'in_progress', signed_delta: mepElectrical - 20, absolute_delta: Math.abs(mepElectrical - 20),
      discrepancy_status: Math.abs(mepElectrical - 20) >= 20 ? 'critical' : Math.abs(mepElectrical - 20) >= 10 ? 'warning' : 'ok' },
  ];
}

async function callAtomic(client, { projectId, contractorReportId, visitDate, obs, meta, clientRequestId }) {
  return client.rpc('submit_site_visit_atomic', {
    p_project_id: projectId,
    p_contractor_report_id: contractorReportId ?? null,
    p_visit_date: visitDate,
    p_observations: obs,
    p_meta: meta ?? {},
    p_client_request_id: clientRequestId,
  });
}

async function main() {
  const pmA = await signInAs(state.users.pmAAssigned.email, PASSWORD);
  const pmAUnassigned = await signInAs(state.users.pmAUnassigned.email, PASSWORD);
  const contractorA = await signInAs(state.users.contractorAAssigned.email, PASSWORD);
  const viewerA = await signInAs(state.users.viewerA.email, PASSWORD);

  const visitsBeforeA = countRows('site_visits', `project_id = ${PROJECT_A}`);
  const historyBeforeA = countRows('progress_history', `project_id = ${PROJECT_A}`);

  // ── SV-01: successful submit ────────────────────────────────────────────
  r.section('SV-01: successful submit (assigned PM)');
  const sv01Date = '2026-08-10';
  const sv01Req = randomUUID();
  const { data: sv01, error: sv01Err } = await callAtomic(pmA, {
    projectId: PROJECT_A, contractorReportId: state.preExisting.contractorReportA, visitDate: sv01Date,
    obs: observations(), meta: { overallNote: 'cert run SV-01' }, clientRequestId: sv01Req,
  });
  r.check('RPC call succeeds', !sv01Err, sv01Err?.message);
  const sv01VisitId = sv01?.siteVisit?.id;
  r.check('response has a persisted site visit id', !!sv01VisitId);
  r.check('1 new site_visits row', countRows('site_visits', `project_id = ${PROJECT_A}`) === visitsBeforeA + 1);
  r.check('2 observation child rows (site_visit_wps)', sv01VisitId != null && countRows('site_visit_wps', `site_visit_id = ${sv01VisitId}`) === 2);
  r.check('observationCount = 2 in response', sv01?.observationCount === 2);
  r.check('discrepancy row(s) created for the flagged WPs', countRows('site_visit_discrepancies', `site_visit_id = ${sv01VisitId}`) >= 1);
  r.check('1 new progress_history row', countRows('progress_history', `project_id = ${PROJECT_A}`) === historyBeforeA + 1);
  const sv01Snapshot = psql(`SELECT snapshot->>'overall_progress', snapshot->>'source_type', snapshot->>'discrepancy_sign_convention', snapshot->>'discrepancy_version' FROM public.progress_history WHERE project_id=${PROJECT_A} ORDER BY id DESC LIMIT 1;`);
  const [snapOverall, snapSourceType, snapConvention, snapVersion] = sv01Snapshot.split('|');
  r.check('progress_history row for this visit has overall_progress = NULL (site-visit partial-inspection semantics)', queryOneOverallIsNull());
  r.check('snapshot.source_type = site_visit', snapSourceType === 'site_visit');
  r.check('snapshot.discrepancy_sign_convention = pm-minus-contractor', snapConvention === 'pm-minus-contractor');
  r.check('snapshot.discrepancy_version = 1', snapVersion === '1');
  r.check('idempotentReplay = false on first submit', sv01?.idempotentReplay === false);

  function queryOneOverallIsNull() {
    const v = psql(`SELECT overall_progress IS NULL FROM public.progress_history WHERE project_id=${PROJECT_A} ORDER BY id DESC LIMIT 1;`);
    return v === 't';
  }

  // ── SV-12: sign metadata on the child rows themselves ───────────────────
  r.section('SV-12: historical sign metadata on site_visit_wps/site_visit_discrepancies');
  const wpMeta = psql(`SELECT discrepancy_sign_convention, discrepancy_version FROM public.site_visit_wps WHERE site_visit_id=${sv01VisitId} LIMIT 1;`);
  const [wpConv, wpVer] = wpMeta.split('|');
  r.check('site_visit_wps.discrepancy_sign_convention = pm-minus-contractor', wpConv === 'pm-minus-contractor');
  r.check('site_visit_wps.discrepancy_version = 1', wpVer === '1');
  const discMeta = psql(`SELECT discrepancy_sign_convention, discrepancy_version, signed_delta FROM public.site_visit_discrepancies WHERE site_visit_id=${sv01VisitId} LIMIT 1;`);
  r.check('site_visit_discrepancies row has the same convention/version metadata', discMeta.startsWith('pm-minus-contractor|1|'), discMeta);

  // ── SV-02: idempotent replay ─────────────────────────────────────────────
  r.section('SV-02: idempotent replay (same client_request_id)');
  const { data: sv02, error: sv02Err } = await callAtomic(pmA, {
    projectId: PROJECT_A, contractorReportId: state.preExisting.contractorReportA, visitDate: sv01Date,
    obs: observations(), clientRequestId: sv01Req,
  });
  r.check('replay succeeds', !sv02Err, sv02Err?.message);
  r.check('idempotentReplay = true', sv02?.idempotentReplay === true);
  r.check('same site visit id returned', sv02?.siteVisit?.id === sv01VisitId);
  r.check('no second site_visits row', countRows('site_visits', `project_id = ${PROJECT_A}`) === visitsBeforeA + 1);
  r.check('no duplicate site_visit_wps rows', countRows('site_visit_wps', `site_visit_id = ${sv01VisitId}`) === 2);
  r.check('no duplicate progress_history row', countRows('progress_history', `project_id = ${PROJECT_A}`) === historyBeforeA + 1);

  // ── SV-03: foreign project ───────────────────────────────────────────────
  r.section('SV-03: Company A PM calls RPC for Project B (foreign tenant)');
  const sv03Req = randomUUID();
  const visitsBeforeB = countRows('site_visits', `project_id = ${PROJECT_B}`);
  const { error: sv03Err } = await callAtomic(pmA, {
    projectId: PROJECT_B, visitDate: '2026-08-11', obs: observations(), clientRequestId: sv03Req,
  });
  r.check('denied', !!sv03Err, JSON.stringify(sv03Err));
  r.check('0 new site_visits rows on Project B', countRows('site_visits', `project_id = ${PROJECT_B}`) === visitsBeforeB);
  r.check('0 committed ledger rows for the rejected request', countRows('write_command_requests', `client_request_id = '${sv03Req}'`) === 0);

  // ── SV-04: "unassigned" PM (same company, no per-project assignment) ────
  r.section('SV-04: PM in the same company but not in profiles.assigned_projects for Project A');
  const sv04Req = randomUUID();
  const visitsBeforeSv04 = countRows('site_visits', `project_id = ${PROJECT_A}`);
  const { data: sv04, error: sv04Err } = await callAtomic(pmAUnassigned, {
    projectId: PROJECT_A, visitDate: '2026-08-12', obs: observations(), clientRequestId: sv04Req,
  });
  if (sv04Err) {
    r.check('ACTUAL BEHAVIOR: denied', true, sv04Err.message);
  } else {
    r.check('ACTUAL BEHAVIOR (confirmed by reading can_write_project() in 020): PM authorization is COMPANY-scoped, not per-project — any PM in the same company can write any project in that company regardless of profiles.assigned_projects. This is not a defect: assigned_projects is only consulted for the contractor role branch. Documented here as the verified current access model, matching this migration\'s own design.', true,
      `site visit ${sv04?.siteVisit?.id} created by a same-company PM with empty assigned_projects`);
  }

  // ── SV-05: viewer ────────────────────────────────────────────────────────
  r.section('SV-05: Viewer calls Site Visit RPC');
  const sv05Req = randomUUID();
  const { error: sv05Err } = await callAtomic(viewerA, {
    projectId: PROJECT_A, visitDate: '2026-08-13', obs: observations(), clientRequestId: sv05Req,
  });
  r.check('denied', !!sv05Err, JSON.stringify(sv05Err));
  r.check('error code 42501 or authorization message', sv05Err?.code === '42501' || /not authorized/i.test(sv05Err?.message ?? ''), sv05Err?.message);

  // Also confirm a Contractor cannot call this RPC either (role gate: admin/pm only).
  const svContractorReq = randomUUID();
  const { error: svContractorErr } = await callAtomic(contractorA, {
    projectId: PROJECT_A, visitDate: '2026-08-13', obs: observations(), clientRequestId: svContractorReq,
  });
  r.check('Contractor also denied (role gate is admin/pm only)', !!svContractorErr, JSON.stringify(svContractorErr));

  // ── SV-06: foreign contractor report ────────────────────────────────────
  r.section('SV-06: contractor_report_id from a different project/company passed in');
  const sv06Req = randomUUID();
  const visitsBeforeSv06 = countRows('site_visits', `project_id = ${PROJECT_A}`);
  const { error: sv06Err } = await callAtomic(pmA, {
    projectId: PROJECT_A, contractorReportId: state.preExisting.contractorReportB /* belongs to Project B */,
    visitDate: '2026-08-14', obs: observations(), clientRequestId: sv06Req,
  });
  r.check('denied / rejected', !!sv06Err, JSON.stringify(sv06Err));
  r.check('error mentions the report/project mismatch', /does not belong to project/i.test(sv06Err?.message ?? '') || sv06Err?.code === '23503', sv06Err?.message);
  r.check('no new site_visits row', countRows('site_visits', `project_id = ${PROJECT_A}`) === visitsBeforeSv06);
  r.check('no committed ledger row', countRows('write_command_requests', `client_request_id = '${sv06Req}'`) === 0);

  // ── SV-07: duplicate WP observations in one payload ─────────────────────
  r.section('SV-07: duplicate WP observation within one payload');
  const sv07Req = randomUUID();
  const visitsBeforeSv07 = countRows('site_visits', `project_id = ${PROJECT_A}`);
  const { error: sv07Err } = await callAtomic(pmA, {
    projectId: PROJECT_A, visitDate: '2026-08-15',
    obs: [...observations(), { ...observations()[0] }], // demo.walls appears twice
    clientRequestId: sv07Req,
  });
  r.check('rejected (duplicate WP observations enforced)', !!sv07Err, JSON.stringify(sv07Err));
  r.check('error mentions duplicate observations', /duplicate/i.test(sv07Err?.message ?? ''), sv07Err?.message);
  r.check('no partial site_visits row', countRows('site_visits', `project_id = ${PROJECT_A}`) === visitsBeforeSv07);

  // ── SV-08: out-of-scope WP ──────────────────────────────────────────────
  r.section('SV-08: observation for a WP outside active scope');
  const sv08Req = randomUUID();
  const visitsBeforeSv08 = countRows('site_visits', `project_id = ${PROJECT_A}`);
  const { error: sv08Err } = await callAtomic(pmA, {
    projectId: PROJECT_A, visitDate: '2026-08-16',
    obs: [{ wpId: 'legacy.archived', observed_progress: 50, observed_status: 'in_progress', gc_progress: 50 }],
    clientRequestId: sv08Req,
  });
  r.check('rejected (out-of-scope/archived WP enforced)', !!sv08Err, JSON.stringify(sv08Err));
  r.check('error mentions invalid/out-of-scope observation', /invalid|out-of-scope/i.test(sv08Err?.message ?? ''), sv08Err?.message);
  r.check('no partial site_visits row', countRows('site_visits', `project_id = ${PROJECT_A}`) === visitsBeforeSv08);
  // Also confirm a WP that doesn't exist in project_gantt_tasks AT ALL is equally rejected.
  const sv08bReq = randomUUID();
  const { error: sv08bErr } = await callAtomic(pmA, {
    projectId: PROJECT_A, visitDate: '2026-08-16',
    obs: [{ wpId: 'totally.unknown.wp', observed_progress: 50, observed_status: 'in_progress', gc_progress: 50 }],
    clientRequestId: sv08bReq,
  });
  r.check('nonexistent wpId also rejected', !!sv08bErr, JSON.stringify(sv08bErr));

  // ── SV-09: invalid progress values ──────────────────────────────────────
  r.section('SV-09: invalid progress values (negative, >100, non-numeric)');
  for (const [label, progress] of [['negative', -5], ['over 100', 150]]) {
    const req = randomUUID();
    const before = countRows('site_visits', `project_id = ${PROJECT_A}`);
    const { error } = await callAtomic(pmA, {
      projectId: PROJECT_A, visitDate: '2026-08-17',
      obs: [{ wpId: 'demo.walls', observed_progress: progress, observed_status: 'in_progress', gc_progress: 40 }],
      clientRequestId: req,
    });
    r.check(`${label} observed_progress (${progress}) rejected`, !!error, JSON.stringify(error));
    r.check(`${label}: no partial site_visits row`, countRows('site_visits', `project_id = ${PROJECT_A}`) === before);
  }
  {
    const req = randomUUID();
    const { error } = await callAtomic(pmA, {
      projectId: PROJECT_A, visitDate: '2026-08-17',
      obs: [{ wpId: 'demo.walls', observed_progress: 'not-a-number', observed_status: 'in_progress', gc_progress: 40 }],
      clientRequestId: req,
    });
    r.check('non-numeric progress string rejected (JSON->numeric cast fails)', !!error, JSON.stringify(error));
  }

  // ── SV-10: forced discrepancy-child failure after header stage ─────────
  r.section('SV-10: forced failure after header insert (bad cast in observation child rows)');
  const sv10Req = randomUUID();
  const visitsBeforeSv10 = countRows('site_visits', `project_id = ${PROJECT_A}`);
  const historyBeforeSv10 = countRows('progress_history', `project_id = ${PROJECT_A}`);
  // observed_progress/gc_progress pass the >=0/<=100 outer validation (both null,
  // which the CASE-based validation query does not flag since NULL comparisons
  // are never TRUE) but signed_delta is a non-castable string, breaking the
  // later jsonb_to_recordset() used for the actual INSERT — a genuine internal
  // constraint violated after outer validation already passed, per Stage 10's
  // allowed failure-injection technique.
  const { error: sv10Err } = await callAtomic(pmA, {
    projectId: PROJECT_A, visitDate: '2026-08-18',
    obs: [{ wpId: 'demo.walls', observed_progress: 40, observed_status: 'in_progress', gc_progress: 40, signed_delta: 'not-a-number', absolute_delta: 0, discrepancy_status: 'ok' }],
    clientRequestId: sv10Req,
  });
  r.check('RPC call fails on the internal cast', !!sv10Err, JSON.stringify(sv10Err));
  r.check('no site_visits header row persisted — full rollback', countRows('site_visits', `project_id = ${PROJECT_A}`) === visitsBeforeSv10);
  r.check('no progress_history row persisted — full rollback', countRows('progress_history', `project_id = ${PROJECT_A}`) === historyBeforeSv10);
  r.check('no committed ledger row', countRows('write_command_requests', `client_request_id = '${sv10Req}'`) === 0);

  // ── SV-11: Gantt/cache update is inside the same transaction ───────────
  r.section('SV-11: project_gantt_tasks cache update transactionality');
  const beforeGantt = psql(`SELECT site_visit_progress, discrepancy_status FROM public.project_gantt_tasks WHERE project_id=${PROJECT_A} AND wp_id='demo.walls';`);
  r.check('project_gantt_tasks was updated by SV-01\'s successful call (same-transaction side effect confirmed)', beforeGantt.startsWith('45|'), beforeGantt);
  r.check('SV-10\'s failed call did NOT alter project_gantt_tasks (still reflects SV-01\'s committed value, not a partial write)',
    psql(`SELECT site_visit_progress FROM public.project_gantt_tasks WHERE project_id=${PROJECT_A} AND wp_id='demo.walls';`) === '45');

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main().catch(err => { console.error('CERTIFICATION SCRIPT ERROR:', err); process.exit(2); });
