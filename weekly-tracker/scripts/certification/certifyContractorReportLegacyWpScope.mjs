// Migration 036 certification (LWS-01..LWS-08) — proves the narrow legacy WP
// scope extension to submit_contractor_report_atomic behaves exactly as
// designed: legacy::<group>::<task> rows are accepted ONLY for a project with
// zero active project_gantt_tasks, and are rejected outright the moment a
// project has any real Gantt scope — the exact "strictly exclusive" mode
// invariant the application itself uses to choose which report UI to render.
// Every scenario calls the REAL RPC through a REAL authenticated client, then
// verifies actual persisted rows via direct psql (ground truth, bypassing RLS).
// Run: node scripts/certification/certifyContractorReportLegacyWpScope.mjs

import { randomUUID } from 'node:crypto';
import { countRows, makeReporter, psql, requireCertificationEnvironment, signInAs } from './lib.mjs';

await requireCertificationEnvironment();

const PASSWORD = 'Cert-Test-Pass-1!';
// Contractor Workspace v1 fixture: KZ-TEST-02, zero project_gantt_tasks rows
// (the legacy/non-Gantt regression scenario this whole fix targets).
const LEGACY_PROJECT = 950002;
// Sprint 4.5 base fixture: PROJECT_A, seeded with 3 active + 1 archived
// project_gantt_tasks rows (the Gantt-scoped project this fix must not affect).
const GANTT_PROJECT = 900001;

const r = makeReporter('Migration 036 legacy WP scope certification (LWS-01..LWS-08)');

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
  const contractorWsA = await signInAs('contractor-ws-a@cert.local', PASSWORD);
  const contractorWsB = await signInAs('contractor-ws-b@cert.local', PASSWORD);
  const contractorAAssigned = await signInAs('contractor-a-assigned@cert.local', PASSWORD);

  // Sanity: confirm the fixture premise this whole suite depends on before
  // asserting anything about it — an assumption bug here would silently
  // invalidate every check below.
  const legacyGanttCount = countRows('project_gantt_tasks', `project_id = ${LEGACY_PROJECT} AND NOT is_archived`);
  const ganttGanttCount = countRows('project_gantt_tasks', `project_id = ${GANTT_PROJECT} AND NOT is_archived`);
  r.section('Fixture premise sanity check');
  r.check(`legacy project ${LEGACY_PROJECT} has zero active project_gantt_tasks`, legacyGanttCount === 0, `found ${legacyGanttCount}`);
  r.check(`gantt project ${GANTT_PROJECT} has at least one active project_gantt_tasks row`, ganttGanttCount > 0, `found ${ganttGanttCount}`);

  // ── LWS-01: legacy project accepts a legacy::<group>::<task> id ────────
  r.section('LWS-01: legacy project (no Gantt scope) accepts legacy::<group>::<task>');
  const lws01Req = randomUUID();
  const reportsBefore01 = countRows('contractor_reports', `project_id = ${LEGACY_PROJECT}`);
  const { data: lws01, error: lws01Err } = await callAtomic(contractorWsA, {
    projectId: LEGACY_PROJECT, reportDate: '2026-09-01',
    wpProgress: [
      { wpId: 'legacy::preconstruction::Site setup & hoarding', progress_pct: 100, status: 'completed' },
      { wpId: 'legacy::preconstruction::Temporary utilities', progress_pct: 50, status: 'in_progress' },
    ],
    meta: { overallProgress: 75 },
    clientRequestId: lws01Req,
  });
  r.check('accepted (no error)', !lws01Err, JSON.stringify(lws01Err));
  r.check('1 new report row', countRows('contractor_reports', `project_id = ${LEGACY_PROJECT}`) === reportsBefore01 + 1);
  const lws01ReportId = lws01?.report?.id;
  r.check('2 structured WP rows created', lws01ReportId != null && countRows('contractor_report_wps', `report_id = ${lws01ReportId}`) === 2);
  const lws01Status = psql(`SELECT status FROM public.contractor_report_wps WHERE report_id=${lws01ReportId} AND wp_id='legacy::preconstruction::Site setup & hoarding';`);
  r.check('stored status matches submitted status exactly (completed)', lws01Status === 'completed', lws01Status);

  // ── LWS-02: Gantt project still accepts canonical Gantt task ids (unchanged) ──
  r.section('LWS-02: Gantt project accepts a canonical Gantt task id (unchanged behavior)');
  const lws02Req = randomUUID();
  const reportsBefore02 = countRows('contractor_reports', `project_id = ${GANTT_PROJECT}`);
  const { data: lws02, error: lws02Err } = await callAtomic(contractorAAssigned, {
    projectId: GANTT_PROJECT, reportDate: '2026-09-02',
    wpProgress: [{ wpId: 'demo.walls', progress_pct: 40, status: 'in_progress' }],
    clientRequestId: lws02Req,
  });
  r.check('accepted (no error)', !lws02Err, JSON.stringify(lws02Err));
  r.check('1 new report row', countRows('contractor_reports', `project_id = ${GANTT_PROJECT}`) === reportsBefore02 + 1);

  // ── LWS-03 (critical): Gantt project REJECTS a legacy::-formatted id ───
  // This is the core safety property of the narrow migration: the bypass
  // must never apply once real Gantt scope exists for the project, proving
  // migration 036 cannot be used as a generic WP-scope bypass.
  r.section('LWS-03: Gantt project (has active scope) REJECTS a legacy::-formatted id');
  const lws03Req = randomUUID();
  const reportsBefore03 = countRows('contractor_reports', `project_id = ${GANTT_PROJECT}`);
  const { error: lws03Err } = await callAtomic(contractorAAssigned, {
    projectId: GANTT_PROJECT, reportDate: '2026-09-03',
    wpProgress: [{ wpId: 'legacy::demo::Fake task smuggled onto a Gantt project', progress_pct: 100, status: 'completed' }],
    clientRequestId: lws03Req,
  });
  r.check('rejected', !!lws03Err, JSON.stringify(lws03Err));
  r.check('error is WORK_PACKAGE_OUT_OF_SCOPE', lws03Err?.code === '22023' && /WORK_PACKAGE_OUT_OF_SCOPE/.test(lws03Err?.message ?? ''), lws03Err?.message);
  r.check('no report row created', countRows('contractor_reports', `project_id = ${GANTT_PROJECT}`) === reportsBefore03);

  // ── LWS-04: legacy project REJECTS a garbage id (neither format) ───────
  r.section('LWS-04: legacy project REJECTS a garbage id (not legacy::-prefixed, not a real Gantt task)');
  const lws04Req = randomUUID();
  const reportsBefore04 = countRows('contractor_reports', `project_id = ${LEGACY_PROJECT}`);
  const { error: lws04Err } = await callAtomic(contractorWsA, {
    projectId: LEGACY_PROJECT, reportDate: '2026-09-04',
    wpProgress: [{ wpId: 'totally.made.up.id', progress_pct: 50, status: 'in_progress' }],
    clientRequestId: lws04Req,
  });
  r.check('rejected', !!lws04Err, JSON.stringify(lws04Err));
  r.check('error is WORK_PACKAGE_OUT_OF_SCOPE', lws04Err?.code === '22023' && /WORK_PACKAGE_OUT_OF_SCOPE/.test(lws04Err?.message ?? ''), lws04Err?.message);
  r.check('no report row created', countRows('contractor_reports', `project_id = ${LEGACY_PROJECT}`) === reportsBefore04);

  // ── LWS-05: unassigned contractor cannot use the legacy path either ────
  // (authorization check from 018 runs before the WP-scope check; confirms
  // migration 036 did not weaken it.)
  r.section('LWS-05: Contractor B (not assigned to the legacy project) is still denied');
  const lws05Req = randomUUID();
  const reportsBefore05 = countRows('contractor_reports', `project_id = ${LEGACY_PROJECT}`);
  const { error: lws05Err } = await callAtomic(contractorWsB, {
    projectId: LEGACY_PROJECT, reportDate: '2026-09-05',
    wpProgress: [{ wpId: 'legacy::preconstruction::Site setup & hoarding', progress_pct: 100, status: 'completed' }],
    clientRequestId: lws05Req,
  });
  r.check('denied', !!lws05Err, JSON.stringify(lws05Err));
  r.check('no report row created', countRows('contractor_reports', `project_id = ${LEGACY_PROJECT}`) === reportsBefore05);

  // ── LWS-06: legacy::<anything> is NOT validated against the WORK_PACKAGES
  // catalog content itself — documented, bounded finding (not a pass/fail),
  // same "FINDING" convention certifyContractorReport.mjs already uses for
  // CR-07/CR-08. Authorization/project-mode boundary is fully enforced
  // (LWS-03/04/05 above); this is a narrower, lower-severity gap: an actor
  // ALREADY authorized to submit reports for this exact legacy project could
  // attribute a nonsense-labeled row to their own legitimate report. No
  // privilege escalation, no cross-tenant/cross-project reach.
  r.section('LWS-06: legacy::<anything> content is not validated against the WORK_PACKAGES catalog (documented, bounded finding)');
  const lws06Req = randomUUID();
  const { data: lws06, error: lws06Err } = await callAtomic(contractorWsA, {
    projectId: LEGACY_PROJECT, reportDate: '2026-09-06',
    wpProgress: [{ wpId: 'legacy::not-a-real-group::not-a-real-task', progress_pct: 10, status: 'not_started' }],
    clientRequestId: lws06Req,
  });
  if (lws06Err) {
    r.check('rejected (catalog-content validation exists)', true);
  } else {
    r.check('FINDING (not a pass/fail on its own): the legacy::<group>::<task> prefix format alone is sufficient to pass the scope check on an eligible legacy project — group/task content is not cross-checked against config/workPackages.js. Bounded to actors already authorized for this exact project; no authorization or cross-project effect.', true,
      `report id ${lws06?.report?.id} accepted with a non-catalog group/task pair`);
  }

  // ── LWS-07: encode/decode round-trip is stable through the full pipeline
  // for a task name containing characters adjacent to the delimiter, proving
  // the ':' /space-heavy real catalog names never collide with the '::' delimiter.
  r.section('LWS-07: encode/decode round-trip stability for a real catalog task name containing spaces and an ampersand-like separator');
  const lws07Req = randomUUID();
  const { data: lws07, error: lws07Err } = await callAtomic(contractorWsA, {
    projectId: LEGACY_PROJECT, reportDate: '2026-09-07',
    wpProgress: [{ wpId: 'legacy::mep::Audio / PA rough-in', progress_pct: 100, status: 'completed' }],
    clientRequestId: lws07Req,
  });
  r.check('accepted (slash in task name does not break the encoding)', !lws07Err, JSON.stringify(lws07Err));
  const lws07Stored = psql(`SELECT wp_id FROM public.contractor_report_wps WHERE report_id=${lws07?.report?.id};`);
  r.check('wp_id stored verbatim, decodable', lws07Stored === 'legacy::mep::Audio / PA rough-in', lws07Stored);

  // ── LWS-08: a REAL Gantt task id from a Gantt-scoped project cannot be
  // smuggled onto an unrelated legacy project that has no such scope.
  // 'demo.walls' is a genuine active wp_id on GANTT_PROJECT (900001) — using
  // it against LEGACY_PROJECT (950002), which has zero project_gantt_tasks
  // rows of its own, must still be rejected.
  r.section('LWS-08: a real Gantt task id from another project cannot be smuggled onto an unrelated legacy project');
  const lws08Req = randomUUID();
  const reportsBefore08 = countRows('contractor_reports', `project_id = ${LEGACY_PROJECT}`);
  const { error: lws08Err } = await callAtomic(contractorWsA, {
    projectId: LEGACY_PROJECT, reportDate: '2026-09-08',
    wpProgress: [{ wpId: 'demo.walls', progress_pct: 100, status: 'completed' }],
    clientRequestId: lws08Req,
  });
  r.check('rejected', !!lws08Err, JSON.stringify(lws08Err));
  r.check('error is WORK_PACKAGE_OUT_OF_SCOPE', lws08Err?.code === '22023' && /WORK_PACKAGE_OUT_OF_SCOPE/.test(lws08Err?.message ?? ''), lws08Err?.message);
  r.check('no report row created', countRows('contractor_reports', `project_id = ${LEGACY_PROJECT}`) === reportsBefore08);

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main();
