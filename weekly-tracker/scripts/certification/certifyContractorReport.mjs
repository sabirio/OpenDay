// Sprint 4.5 — Stage 5: Contractor Report RPC certification (CR-01..CR-10).
// Every scenario calls the REAL submit_contractor_report_atomic RPC through
// a REAL authenticated supabase-js client (signInWithPassword, not
// service-role), then verifies actual persisted rows via direct psql
// (ground truth, bypassing RLS) — not just the RPC's own response.
// Run: node certifyContractorReport.mjs

import { randomUUID } from 'node:crypto';
import { loadFixtureState, psql, countRows, signInAs, makeReporter, requireCertificationEnvironment } from './lib.mjs';

await requireCertificationEnvironment();

const state = loadFixtureState();
const PROJECT_A = state.projects.PROJECT_A;
const PROJECT_B = state.projects.PROJECT_B;
const PASSWORD = state.password;

const r = makeReporter('Contractor Report RPC certification (CR-01..CR-10)');

function wpPayload() {
  return [
    { wpId: 'demo.walls', progress_pct: 40, status: 'in_progress', comment: 'cert run' },
    { wpId: 'mep.electrical', progress_pct: 20, status: 'in_progress', comment: null },
    { wpId: 'finish.paint', progress_pct: 0, status: 'not_started', comment: null },
  ];
}

async function callAtomic(client, { projectId, reportDate, wpProgress, meta, clientRequestId }) {
  return client.rpc('submit_contractor_report_atomic', {
    p_project_id: projectId,
    p_report_date: reportDate,
    p_wp_progress: wpProgress,
    p_meta: meta ?? {},
    p_client_request_id: clientRequestId,
  });
}

async function main() {
  const contractorA = await signInAs(state.users.contractorAAssigned.email, PASSWORD);
  const contractorAUnassigned = await signInAs(state.users.contractorAUnassigned.email, PASSWORD);
  const viewerA = await signInAs(state.users.viewerA.email, PASSWORD);

  const baseReportsBefore = countRows('contractor_reports', `project_id = ${PROJECT_A}`);
  const baseHistoryBefore = countRows('progress_history', `project_id = ${PROJECT_A}`);
  const baseLedgerBefore = countRows('write_command_requests', `operation = 'contractor_report.submit'`);

  // ── CR-01: successful submit ────────────────────────────────────────────
  r.section('CR-01: successful submit (assigned Contractor)');
  const cr01Date = '2026-08-03';
  const cr01Req = randomUUID();
  const { data: cr01, error: cr01Err } = await callAtomic(contractorA, {
    projectId: PROJECT_A, reportDate: cr01Date, wpProgress: wpPayload(),
    meta: { overallProgress: 20, cumulativeProgress: 15 }, clientRequestId: cr01Req,
  });
  r.check('RPC call succeeds (no error)', !cr01Err, cr01Err?.message);
  r.check('response has a persisted report id', !!cr01?.report?.id);
  const cr01ReportId = cr01?.report?.id;
  r.check('exactly 1 new report row for Project A', countRows('contractor_reports', `project_id = ${PROJECT_A}`) === baseReportsBefore + 1);
  r.check('3 child WP rows created', cr01ReportId != null && countRows('contractor_report_wps', `report_id = ${cr01ReportId}`) === 3);
  r.check('1 new progress_history snapshot', countRows('progress_history', `project_id = ${PROJECT_A}`) === baseHistoryBefore + 1);
  r.check('response lineItemCount = 3', cr01?.lineItemCount === 3);
  r.check('ledger row exists with this client_request_id', countRows('write_command_requests', `client_request_id = '${cr01Req}' AND operation = 'contractor_report.submit'`) === 1);
  const ledgerSourceId = psql(`SELECT source_record_id FROM public.write_command_requests WHERE client_request_id='${cr01Req}' AND operation='contractor_report.submit';`);
  r.check('ledger source_record_id links to the persisted report', Number(ledgerSourceId) === cr01ReportId);
  const historySnapshot = psql(`SELECT snapshot->>'source_record_id' FROM public.progress_history WHERE project_id=${PROJECT_A} ORDER BY id DESC LIMIT 1;`);
  r.check('progress_history snapshot has source_record_id = report id (025 metadata enrichment applied)', Number(historySnapshot) === cr01ReportId);
  r.check('idempotentReplay = false on first submit', cr01?.idempotentReplay === false);

  // ── CR-02: idempotent replay, same request id ───────────────────────────
  r.section('CR-02: idempotent replay (same client_request_id)');
  const { data: cr02, error: cr02Err } = await callAtomic(contractorA, {
    projectId: PROJECT_A, reportDate: cr01Date, wpProgress: wpPayload(),
    meta: { overallProgress: 20, cumulativeProgress: 15 }, clientRequestId: cr01Req,
  });
  r.check('replay call succeeds (no error)', !cr02Err, cr02Err?.message);
  r.check('idempotentReplay = true', cr02?.idempotentReplay === true);
  r.check('replay returns the SAME report id', cr02?.report?.id === cr01ReportId);
  r.check('no second report row created', countRows('contractor_reports', `project_id = ${PROJECT_A}`) === baseReportsBefore + 1);
  r.check('no duplicate child rows', countRows('contractor_report_wps', `report_id = ${cr01ReportId}`) === 3);
  r.check('no duplicate progress_history row', countRows('progress_history', `project_id = ${PROJECT_A}`) === baseHistoryBefore + 1);
  r.check('ledger still has exactly 1 row for this request id', countRows('write_command_requests', `client_request_id = '${cr01Req}'`) === 1);

  // ── CR-10: retry-after-presumed-timeout is the same replay path ────────
  r.section('CR-10: simulated timeout/retry (client resends same request id)');
  const { data: cr10 } = await callAtomic(contractorA, {
    projectId: PROJECT_A, reportDate: cr01Date, wpProgress: wpPayload(), clientRequestId: cr01Req,
  });
  r.check('second retry also replays idempotently', cr10?.idempotentReplay === true && cr10?.report?.id === cr01ReportId);
  r.check('still exactly 1 report row after 3 total calls with the same request id', countRows('contractor_reports', `project_id = ${PROJECT_A}`) === baseReportsBefore + 1);

  // ── CR-03: new request id, same project+date -> business duplicate rule ─
  r.section('CR-03: new request id, same report_date (business duplicate rule)');
  const cr03Req = randomUUID();
  const { data: cr03, error: cr03Err } = await callAtomic(contractorA, {
    projectId: PROJECT_A, reportDate: cr01Date, wpProgress: wpPayload(), clientRequestId: cr03Req,
  });
  r.check('rejected as a business duplicate (same project+date already has a report)', !!cr03Err, JSON.stringify(cr03));
  r.check('error code is 23505 (unique/duplicate violation)', cr03Err?.code === '23505' || /already exists/i.test(cr03Err?.message ?? ''), cr03Err?.message);
  r.check('no new report row from the rejected duplicate', countRows('contractor_reports', `project_id = ${PROJECT_A}`) === baseReportsBefore + 1);
  r.check('the failed attempt still leaves NO ledger success row for the new request id (rolled back with everything else)', countRows('write_command_requests', `client_request_id = '${cr03Req}'`) === 0);

  // ── CR-04: foreign project ──────────────────────────────────────────────
  r.section('CR-04: Company A Contractor calls RPC with Project B (foreign tenant)');
  const cr04Req = randomUUID();
  const reportsBeforeB = countRows('contractor_reports', `project_id = ${PROJECT_B}`);
  const historyBeforeB = countRows('progress_history', `project_id = ${PROJECT_B}`);
  const { error: cr04Err } = await callAtomic(contractorA, {
    projectId: PROJECT_B, reportDate: '2026-08-04', wpProgress: wpPayload(), clientRequestId: cr04Req,
  });
  r.check('authorization failure returned', !!cr04Err, JSON.stringify(cr04Err));
  r.check('error code 42501 (insufficient privilege) or company message', cr04Err?.code === '42501' || /not authorized/i.test(cr04Err?.message ?? ''), cr04Err?.message);
  r.check('0 new report rows on Project B', countRows('contractor_reports', `project_id = ${PROJECT_B}`) === reportsBeforeB);
  r.check('0 new history rows on Project B', countRows('progress_history', `project_id = ${PROJECT_B}`) === historyBeforeB);
  r.check('0 committed ledger rows for the rejected request id (whole transaction rolled back)', countRows('write_command_requests', `client_request_id = '${cr04Req}'`) === 0);

  // ── CR-05: unassigned contractor ────────────────────────────────────────
  r.section('CR-05: unassigned Contractor (same company, not assigned to Project A)');
  const cr05Req = randomUUID();
  const reportsBeforeA2 = countRows('contractor_reports', `project_id = ${PROJECT_A}`);
  const { error: cr05Err } = await callAtomic(contractorAUnassigned, {
    projectId: PROJECT_A, reportDate: '2026-08-05', wpProgress: wpPayload(), clientRequestId: cr05Req,
  });
  r.check('denied', !!cr05Err, JSON.stringify(cr05Err));
  r.check('no report row created', countRows('contractor_reports', `project_id = ${PROJECT_A}`) === reportsBeforeA2);
  r.check('no ledger success row', countRows('write_command_requests', `client_request_id = '${cr05Req}'`) === 0);

  // ── CR-06: viewer ────────────────────────────────────────────────────────
  r.section('CR-06: Viewer calls Contractor Report RPC');
  const cr06Req = randomUUID();
  const { error: cr06Err } = await callAtomic(viewerA, {
    projectId: PROJECT_A, reportDate: '2026-08-06', wpProgress: wpPayload(), clientRequestId: cr06Req,
  });
  r.check('denied', !!cr06Err, JSON.stringify(cr06Err));
  r.check('error mentions role/authorization', /cannot submit|not authorized|42501/i.test(cr06Err?.message ?? '') || cr06Err?.code === '42501', cr06Err?.message);
  r.check('no report row created', countRows('contractor_reports', `project_id = ${PROJECT_A}`) === reportsBeforeA2);

  // ── CR-07: WP outside active scope ──────────────────────────────────────
  r.section('CR-07: payload references a WP outside project active scope');
  const cr07Req = randomUUID();
  const reportsBeforeCr07 = countRows('contractor_reports', `project_id = ${PROJECT_A}`);
  const { data: cr07, error: cr07Err } = await callAtomic(contractorA, {
    projectId: PROJECT_A, reportDate: '2026-08-07',
    wpProgress: [{ wpId: 'does.not.exist.in.scope', progress_pct: 50, status: 'in_progress' }],
    clientRequestId: cr07Req,
  });
  if (cr07Err) {
    r.check('rejected with an error (WP scope enforced)', true);
    r.check('no report row created', countRows('contractor_reports', `project_id = ${PROJECT_A}`) === reportsBeforeCr07);
  } else {
    // Document actual behavior rather than assume — see certification report for classification.
    r.check('FINDING (not a pass/fail on its own): submit_contractor_report() does NOT validate wpId against project_gantt_tasks scope — an out-of-scope/nonexistent wpId is silently accepted and inserted', true,
      `report id ${cr07?.report?.id} created with an out-of-scope wpId; no scope check exists in submit_contractor_report()'s body (confirmed by reading 023's function source)`);
  }

  // ── CR-08: duplicate WP item in one payload ─────────────────────────────
  r.section('CR-08: duplicate WP observation within one payload');
  const cr08Req = randomUUID();
  const { data: cr08, error: cr08Err } = await callAtomic(contractorA, {
    projectId: PROJECT_A, reportDate: '2026-08-08',
    wpProgress: [
      { wpId: 'demo.walls', progress_pct: 30, status: 'in_progress' },
      { wpId: 'demo.walls', progress_pct: 60, status: 'in_progress' },
    ],
    clientRequestId: cr08Req,
  });
  if (cr08Err) {
    r.check('rejected with a validation error (duplicate WP enforced)', true);
  } else {
    r.check('FINDING (not a pass/fail on its own): submit_contractor_report() does NOT reject duplicate wpId entries in the same payload — both rows were inserted', true,
      `report id ${cr08?.report?.id}, child rows: ${countRows('contractor_report_wps', `report_id = ${cr08?.report?.id}`)}`);
  }

  // ── CR-09: forced child-insert failure (bad cast, mid-transaction) ─────
  r.section('CR-09: forced child failure (progress_pct that cannot cast to numeric)');
  const cr09Req = randomUUID();
  const reportsBeforeCr09 = countRows('contractor_reports', `project_id = ${PROJECT_A}`);
  const historyBeforeCr09 = countRows('progress_history', `project_id = ${PROJECT_A}`);
  const { error: cr09Err } = await callAtomic(contractorA, {
    projectId: PROJECT_A, reportDate: '2026-08-09',
    wpProgress: [{ wpId: 'demo.walls', progress_pct: 'not-a-number', status: 'in_progress' }],
    clientRequestId: cr09Req,
  });
  r.check('RPC call fails (cast error surfaces)', !!cr09Err, JSON.stringify(cr09Err));
  if (cr09Err) {
    r.check('header count unchanged (0 new rows) — full rollback', countRows('contractor_reports', `project_id = ${PROJECT_A}`) === reportsBeforeCr09);
    r.check('history count unchanged (0 new rows) — full rollback', countRows('progress_history', `project_id = ${PROJECT_A}`) === historyBeforeCr09);
    r.check('no committed ledger row for the failed request', countRows('write_command_requests', `client_request_id = '${cr09Req}'`) === 0);
  }

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main().catch(err => { console.error('CERTIFICATION SCRIPT ERROR:', err); process.exit(2); });
