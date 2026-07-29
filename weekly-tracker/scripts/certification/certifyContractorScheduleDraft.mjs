// certifyContractorScheduleDraft.mjs — Simplification Phase 3B DB/security
// certification for save_contractor_schedule_draft() and the
// schedule_ownership_mode mutual-exclusion invariant.
//
// Real authenticated supabase-js clients (signInWithPassword), same as
// certifyContractorReport.mjs — never the service-role client for the RPC
// calls themselves, since the whole point is proving RLS-adjacent
// authorization inside the RPC body actually holds. Ground truth (setup and
// verification) uses direct psql, bypassing RLS entirely, same pattern as
// every other DB cert script in this repo.
//
// Run: node scripts/certification/certifyContractorScheduleDraft.mjs
// (after: npm run cert:reset:contractor-schedule)

import { randomUUID } from 'node:crypto';
import { loadFixtureState, psql, queryOne, signInAs, makeReporter, requireCertificationEnvironment } from './lib.mjs';

await requireCertificationEnvironment();

const state = loadFixtureState();
const PROJECT_A = state.projects.PROJECT_A;   // company-a, contractor-a-assigned IS assigned
const PROJECT_A2 = state.projects.PROJECT_A2; // company-a, left AUTO_GENERATED for the mutual-exclusion test
const PROJECT_B = state.projects.PROJECT_B;   // company-b
const PASSWORD = state.password;

const r = makeReporter('Contractor Schedule Draft RPC certification (Simplification Phase 3B)');

async function callRpc(client, projectId, changes, clientRequestId = randomUUID()) {
  return client.rpc('save_contractor_schedule_draft', {
    p_project_id: projectId,
    p_changes: changes,
    p_client_request_id: clientRequestId,
  });
}

function gt(projectId, wpId, cols = 'planned_start,planned_end,duration_days') {
  const row = queryOne(`SELECT ${cols} FROM public.project_gantt_tasks WHERE project_id = ${projectId} AND wp_id = '${wpId}';`);
  return row ? row.split('|') : null;
}

try {
  psql(`UPDATE public.projects SET schedule_ownership_mode = 'CONTRACTOR_MANAGED' WHERE id = ${PROJECT_A};`);
  psql(`UPDATE public.projects SET schedule_ownership_mode = 'AUTO_GENERATED' WHERE id = ${PROJECT_A2};`);
  // Cross-project isolation fixture: a WP that exists ONLY under Project B,
  // for test 7 (a wp_id that is real, just not this project's).
  psql(`INSERT INTO public.project_gantt_tasks (project_id, wp_id, wp_label, phase_id, phase_label, is_archived)
        VALUES (${PROJECT_B}, 'b.only.wp', 'B-Only WP', 'demolition', 'Demolition', false)
        ON CONFLICT (project_id, wp_id) DO NOTHING;`);

  const contractorAssigned = await signInAs('contractor-a-assigned@cert.local', PASSWORD);
  const contractorUnassigned = await signInAs('contractor-a-unassigned@cert.local', PASSWORD);
  const contractorB = await signInAs('contractor-b@cert.local', PASSWORD);
  const pmAAssigned = await signInAs('pm-a-assigned@cert.local', PASSWORD);

  r.section('1. Assigned Contractor + CONTRACTOR_MANAGED project -> Save Draft succeeds');
  {
    const { data, error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' },
    ]);
    r.check('RPC succeeds for assigned contractor on a CONTRACTOR_MANAGED project', !error, error?.message);
    r.check('response reports updatedCount=1', data?.updatedCount === 1);
    r.check('response is not a replay on first call', data?.idempotentReplay === false);
    const row = gt(PROJECT_A, 'demo.walls');
    r.check('ground truth: planned_start persisted', row?.[0] === '2026-09-01');
    r.check('ground truth: planned_end persisted', row?.[1] === '2026-09-05');
  }

  r.section('2. Mutual exclusion: even an authorized PM/admin caller is rejected on an AUTO_GENERATED project');
  {
    // Uses pmAAssigned (passes can_write_project on Project A2 via company
    // match — PM authorization does not depend on assigned_projects) so
    // this isolates the SCHEDULE_NOT_CONTRACTOR_MANAGED mode check itself,
    // not merely "this contractor isn't assigned to A2" (a different,
    // already-covered authorization rejection).
    const { error } = await callRpc(pmAAssigned, PROJECT_A2, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' },
    ]);
    r.check('RPC rejects a save against an AUTO_GENERATED project even for an otherwise-authorized PM', !!error);
    r.check('rejection is the SCHEDULE_NOT_CONTRACTOR_MANAGED business rule, not a generic failure',
      /SCHEDULE_NOT_CONTRACTOR_MANAGED/.test(error?.message || ''));
  }
  r.section('2b. Contractor not assigned to a project is rejected regardless of that project\'s schedule mode');
  {
    const { error } = await callRpc(contractorAssigned, PROJECT_A2, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' },
    ]);
    r.check('contractor not in assigned_projects for A2 is rejected', !!error);
  }

  r.section('3. Unassigned Contractor -> rejected (no contractor_email fallback)');
  {
    const { error } = await callRpc(contractorUnassigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' },
    ]);
    r.check('unassigned contractor is rejected even though the project is CONTRACTOR_MANAGED', !!error);
  }

  r.section('4. Wrong company (contractor-b against Project A) -> rejected');
  {
    const { error } = await callRpc(contractorB, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' },
    ]);
    r.check('cross-company contractor is rejected', !!error);
  }

  r.section('5. Archived WP -> rejected');
  {
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'legacy.archived', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' },
    ]);
    r.check('archived WP is rejected', !!error);
    r.check('rejection is WORK_PACKAGE_OUT_OF_SCOPE', /WORK_PACKAGE_OUT_OF_SCOPE/.test(error?.message || ''));
  }

  r.section('6. WP outside active project Scope (does not exist at all) -> rejected');
  {
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'totally.fake.wp', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' },
    ]);
    r.check('nonexistent WP is rejected', !!error);
    r.check('rejection is WORK_PACKAGE_OUT_OF_SCOPE', /WORK_PACKAGE_OUT_OF_SCOPE/.test(error?.message || ''));
  }

  r.section('7. Guessed WP that is real but belongs to another project -> rejected (IDOR/BOLA)');
  {
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'b.only.wp', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' },
    ]);
    r.check('a WP that is real for a DIFFERENT project is rejected against this project', !!error);
    r.check('rejection is WORK_PACKAGE_OUT_OF_SCOPE (project-scoped, not globally-scoped WP identity)',
      /WORK_PACKAGE_OUT_OF_SCOPE/.test(error?.message || ''));
    const untouched = gt(PROJECT_B, 'b.only.wp');
    r.check('Project B\'s own row for that WP was never touched', untouched?.[0] === '');
  }

  r.section('8. Invalid date payload -> entire batch rejected');
  {
    const before = gt(PROJECT_A, 'mep.electrical');
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'mep.electrical', plannedStart: '2026-09-10', plannedEnd: '2026-09-01' }, // start > end
    ]);
    r.check('start > end is rejected', !!error);
    r.check('rejection is INVALID_SCHEDULE_DATES', /INVALID_SCHEDULE_DATES/.test(error?.message || ''));
    const after = gt(PROJECT_A, 'mep.electrical');
    r.check('no mutation occurred (row unchanged)', before?.join('|') === after?.join('|'));
  }

  r.section('9. One invalid WP in a multi-WP batch -> ZERO mutations (atomicity)');
  {
    const beforeElectrical = gt(PROJECT_A, 'mep.electrical');
    const beforePaint = gt(PROJECT_A, 'finish.paint');
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'mep.electrical', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' }, // valid
      { wpId: 'finish.paint',   plannedStart: '2026-09-06', plannedEnd: '2026-09-10' }, // valid
      { wpId: 'legacy.archived', plannedStart: '2026-09-01', plannedEnd: '2026-09-05' }, // invalid: archived
    ]);
    r.check('batch with one invalid WP is rejected wholesale', !!error);
    const afterElectrical = gt(PROJECT_A, 'mep.electrical');
    const afterPaint = gt(PROJECT_A, 'finish.paint');
    r.check('the 2 otherwise-valid WPs in the same batch were NOT mutated (zero partial writes)',
      beforeElectrical?.join('|') === afterElectrical?.join('|') && beforePaint?.join('|') === afterPaint?.join('|'));
  }

  r.section('10. Replay same client_request_id -> idempotent');
  {
    const clientRequestId = randomUUID();
    const first = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'finish.paint', plannedStart: '2026-09-06', plannedEnd: '2026-09-10' },
    ], clientRequestId);
    r.check('first call succeeds', !first.error, first.error?.message);
    r.check('first call is not a replay', first.data?.idempotentReplay === false);

    const rowAfterFirst = gt(PROJECT_A, 'finish.paint');

    const replay = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'finish.paint', plannedStart: '2026-09-06', plannedEnd: '2026-09-10' },
    ], clientRequestId);
    r.check('replay with the same client_request_id succeeds (does not error)', !replay.error, replay.error?.message);
    r.check('replay is reported as a replay', replay.data?.idempotentReplay === true);
    r.check('replay returns the same result payload', replay.data?.updatedCount === first.data?.updatedCount);

    const rowAfterReplay = gt(PROJECT_A, 'finish.paint');
    r.check('replay does not create a duplicate mutation (row unchanged from after the first call)',
      rowAfterFirst.join('|') === rowAfterReplay.join('|'));

    const ledgerCount = queryOne(
      `SELECT COUNT(*) FROM public.write_command_requests WHERE operation = 'schedule.save_draft' AND client_request_id = '${clientRequestId}';`
    );
    r.check('exactly one command ledger row exists for this client_request_id (no duplicate command effects)', ledgerCount === '1');
  }

  r.section('11-13. RPC cannot mutate protected fields; only submitted WPs change; duration_days is server-derived');
  {
    psql(`UPDATE public.project_gantt_tasks SET actual_progress = 42, status = 'in_progress', is_critical = true, is_archived = false
          WHERE project_id = ${PROJECT_A} AND wp_id = 'demo.walls';`);
    const protectedBefore = queryOne(
      `SELECT actual_progress, status, is_critical, project_id, wp_id FROM public.project_gantt_tasks WHERE project_id = ${PROJECT_A} AND wp_id = 'demo.walls';`
    );

    const otherWpBefore = gt(PROJECT_A, 'mep.electrical');

    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-10-01', plannedEnd: '2026-10-08' }, // 7-day span
    ]);
    r.check('save succeeds', !error, error?.message);

    const protectedAfter = queryOne(
      `SELECT actual_progress, status, is_critical, project_id, wp_id FROM public.project_gantt_tasks WHERE project_id = ${PROJECT_A} AND wp_id = 'demo.walls';`
    );
    r.check('actual_progress/status/is_critical/project_id/wp_id are byte-identical before and after (RPC never touches them)',
      protectedBefore === protectedAfter);

    const otherWpAfter = gt(PROJECT_A, 'mep.electrical');
    r.check('a WP NOT included in this batch (mep.electrical) is untouched', otherWpBefore.join('|') === otherWpAfter.join('|'));

    const durationRow = gt(PROJECT_A, 'demo.walls', 'duration_days');
    r.check('duration_days is server-derived as planned_end - planned_start (7 days), never client-supplied', durationRow?.[0] === '7');
  }

  r.section('14. Command ledger: one Save Draft action = exactly one command');
  {
    const clientRequestId = randomUUID();
    await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-11-01', plannedEnd: '2026-11-04' },
      { wpId: 'mep.electrical', plannedStart: '2026-11-05', plannedEnd: '2026-11-08' },
    ], clientRequestId);
    const count = queryOne(
      `SELECT COUNT(*) FROM public.write_command_requests WHERE operation = 'schedule.save_draft' AND client_request_id = '${clientRequestId}';`
    );
    r.check('a 2-WP batch still produces exactly one command ledger row (one action, not one per WP)', count === '1');
  }
} finally {
  psql(`DELETE FROM public.project_gantt_tasks WHERE project_id = ${PROJECT_B} AND wp_id = 'b.only.wp';`);
  psql(`UPDATE public.projects SET schedule_ownership_mode = 'AUTO_GENERATED' WHERE id IN (${PROJECT_A}, ${PROJECT_A2});`);
}

const { fail } = r.summary();
process.exit(fail === 0 ? 0 : 1);
