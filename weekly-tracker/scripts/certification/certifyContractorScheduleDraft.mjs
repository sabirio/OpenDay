// certifyContractorScheduleDraft.mjs — Simplification Phase 3B / 3B.1 /
// 3C.1 DB/security certification for save_contractor_schedule_draft() (as
// finalized by 048_contractor_schedule_ownership_enforcement.sql's
// Contractor-only authorization contract) and the schedule_ownership_mode
// mutual-exclusion invariant.
//
// Real authenticated supabase-js clients (signInWithPassword), same as
// certifyContractorReport.mjs — never the service-role client for the RPC
// calls themselves, since the whole point is proving RLS-adjacent
// authorization inside the RPC body actually holds. Ground truth (setup and
// verification) uses direct psql, bypassing RLS entirely, same pattern as
// every other DB cert script in this repo.
//
// p_changes items are {wpId, plannedStart, plannedFinish} — plannedFinish
// is the HUMAN-FACING INCLUSIVE date (047's contract). Ground-truth reads
// via gt() below read the raw DB columns, which remain the INTERNAL
// exclusive boundary (planned_end = plannedFinish + 1) — this file
// deliberately keeps both vocabularies visible side by side so the
// conversion is never silently assumed.
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

const r = makeReporter('Contractor Schedule Draft RPC certification (Simplification Phase 3B/3B.1)');

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
  const adminA = await signInAs('admin-a@cert.local', PASSWORD);
  const viewerA = await signInAs('viewer-a@cert.local', PASSWORD);

  r.section('1. Assigned Contractor + CONTRACTOR_MANAGED project -> Save Draft succeeds; human Aug1/Aug3 -> 3 days');
  {
    const { data, error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedFinish: '2026-09-03' },
    ]);
    r.check('RPC succeeds for assigned contractor on a CONTRACTOR_MANAGED project', !error, error?.message);
    r.check('response reports updatedCount=1', data?.updatedCount === 1);
    r.check('response is not a replay on first call', data?.idempotentReplay === false);
    const row = gt(PROJECT_A, 'demo.walls');
    r.check('ground truth: planned_start persisted as-entered', row?.[0] === '2026-09-01');
    r.check('ground truth: internal planned_end is plannedFinish + 1 (exclusive boundary canonicalization)', row?.[1] === '2026-09-04');
    r.check('ground truth: duration_days is 3 (Sep1/Sep2/Sep3 inclusive), not 2', row?.[2] === '3');
  }

  r.section('1b. Zero-day protection: human Start == Finish persists as ONE day, not zero (SCHEDULE-DEBT / Owner correction)');
  {
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'finish.paint', plannedStart: '2026-09-15', plannedFinish: '2026-09-15' },
    ]);
    r.check('Start == Finish is ACCEPTED (means one calendar day, not rejected as zero-width)', !error, error?.message);
    const row = gt(PROJECT_A, 'finish.paint');
    r.check('internal planned_end is the day after (exclusive boundary for a 1-day task)', row?.[1] === '2026-09-16');
    r.check('duration_days is 1, never 0', row?.[2] === '1');
  }

  r.section('2. Mutual exclusion: even an assigned, authorized Contractor is rejected on an AUTO_GENERATED project');
  {
    // Temporarily assign contractorAssigned to A2 so this isolates the
    // SCHEDULE_NOT_CONTRACTOR_MANAGED mode check itself, not merely "this
    // contractor isn't assigned to A2" (a different, separately-covered
    // rejection in 2b below). Reverted in the finally block.
    psql(`UPDATE public.profiles SET assigned_projects = array_append(COALESCE(assigned_projects, '{}'::integer[]), ${PROJECT_A2})
          WHERE id = (SELECT id FROM auth.users WHERE email = 'contractor-a-assigned@cert.local');`);
    const { error } = await callRpc(contractorAssigned, PROJECT_A2, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
    ]);
    r.check('RPC rejects a save against an AUTO_GENERATED project even for an assigned, otherwise-authorized Contractor', !!error);
    r.check('rejection is the SCHEDULE_NOT_CONTRACTOR_MANAGED business rule, not a generic failure',
      /SCHEDULE_NOT_CONTRACTOR_MANAGED/.test(error?.message || ''));
    // Revert the temporary grant before 2b tests non-assignment in isolation.
    psql(`UPDATE public.profiles SET assigned_projects = array_remove(assigned_projects, ${PROJECT_A2})
          WHERE id = (SELECT id FROM auth.users WHERE email = 'contractor-a-assigned@cert.local');`);
  }
  r.section('2b. Contractor not assigned to a project is rejected regardless of that project\'s schedule mode');
  {
    const { error } = await callRpc(contractorAssigned, PROJECT_A2, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
    ]);
    r.check('contractor not in assigned_projects for A2 is rejected (temporary 2. grant has been reverted before this runs)', !!error);
  }

  r.section('2c. Contractor Draft ownership (Simplification Phase 3C.1): PM is rejected on a CONTRACTOR_MANAGED project');
  {
    // pm-a-assigned previously passed via the generic can_write_project()
    // helper (same company, admin/pm write access) — 048 removes that
    // branch entirely for this RPC. Contractor Draft ownership is
    // Contractor-only; PM review/approval is a distinct, not-yet-built
    // workflow.
    const { error } = await callRpc(pmAAssigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
    ]);
    r.check('PM is rejected even on a CONTRACTOR_MANAGED project PM would otherwise be authorized to write', !!error);
    r.check('rejection is the authorization failure, not the mode-exclusion rule (PM never reaches the mode check)',
      /Not authorized/.test(error?.message || ''));
  }

  r.section('2d. Contractor Draft ownership: Admin is rejected on a CONTRACTOR_MANAGED project (no implicit override)');
  {
    // Admin previously also passed via can_write_project()'s global-admin
    // branch. No Admin-specific authorization branch exists in this RPC —
    // any future Admin support override must be its own explicit,
    // separately documented branch, never inherited from can_write_project().
    const { error } = await callRpc(adminA, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
    ]);
    r.check('Admin is rejected — no ambiguous implicit privilege', !!error);
    r.check('rejection is the authorization failure', /Not authorized/.test(error?.message || ''));
  }

  r.section('2e. Viewer is rejected on a CONTRACTOR_MANAGED project');
  {
    const { error } = await callRpc(viewerA, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
    ]);
    r.check('Viewer is rejected', !!error);
    r.check('rejection is the authorization failure', /Not authorized/.test(error?.message || ''));
  }

  r.section('3. Unassigned Contractor -> rejected (no contractor_email fallback)');
  {
    const { error } = await callRpc(contractorUnassigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
    ]);
    r.check('unassigned contractor is rejected even though the project is CONTRACTOR_MANAGED', !!error);
  }

  r.section('4. Wrong company (contractor-b against Project A) -> rejected');
  {
    const { error } = await callRpc(contractorB, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
    ]);
    r.check('cross-company contractor is rejected', !!error);
  }

  r.section('5. Archived WP -> rejected');
  {
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'legacy.archived', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
    ]);
    r.check('archived WP is rejected', !!error);
    r.check('rejection is WORK_PACKAGE_OUT_OF_SCOPE', /WORK_PACKAGE_OUT_OF_SCOPE/.test(error?.message || ''));
  }

  r.section('6. WP outside active project Scope (does not exist at all) -> rejected');
  {
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'totally.fake.wp', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
    ]);
    r.check('nonexistent WP is rejected', !!error);
    r.check('rejection is WORK_PACKAGE_OUT_OF_SCOPE', /WORK_PACKAGE_OUT_OF_SCOPE/.test(error?.message || ''));
  }

  r.section('7. Guessed WP that is real but belongs to another project -> rejected (IDOR/BOLA)');
  {
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'b.only.wp', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' },
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
      { wpId: 'mep.electrical', plannedStart: '2026-09-10', plannedFinish: '2026-09-01' }, // start > finish
    ]);
    r.check('start > finish is rejected', !!error);
    r.check('rejection is INVALID_SCHEDULE_DATES', /INVALID_SCHEDULE_DATES/.test(error?.message || ''));
    const after = gt(PROJECT_A, 'mep.electrical');
    r.check('no mutation occurred (row unchanged)', before?.join('|') === after?.join('|'));
  }

  r.section('9. One invalid WP in a multi-WP batch -> ZERO mutations (atomicity)');
  {
    const beforeElectrical = gt(PROJECT_A, 'mep.electrical');
    const beforePaint = gt(PROJECT_A, 'finish.paint');
    const { error } = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'mep.electrical', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' }, // valid
      { wpId: 'finish.paint',   plannedStart: '2026-09-06', plannedFinish: '2026-09-10' }, // valid
      { wpId: 'legacy.archived', plannedStart: '2026-09-01', plannedFinish: '2026-09-05' }, // invalid: archived
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
      { wpId: 'finish.paint', plannedStart: '2026-09-06', plannedFinish: '2026-09-10' },
    ], clientRequestId);
    r.check('first call succeeds', !first.error, first.error?.message);
    r.check('first call is not a replay', first.data?.idempotentReplay === false);

    const rowAfterFirst = gt(PROJECT_A, 'finish.paint');

    const replay = await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'finish.paint', plannedStart: '2026-09-06', plannedFinish: '2026-09-10' },
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
      { wpId: 'demo.walls', plannedStart: '2026-10-01', plannedFinish: '2026-10-07' }, // human-inclusive 7-day span
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
    r.check('duration_days is server-derived as (plannedFinish+1) - plannedStart = 7, never client-supplied', durationRow?.[0] === '7');
  }

  r.section('14. Command ledger: one Save Draft action = exactly one command');
  {
    const clientRequestId = randomUUID();
    await callRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2026-11-01', plannedFinish: '2026-11-03' },
      { wpId: 'mep.electrical', plannedStart: '2026-11-05', plannedFinish: '2026-11-07' },
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
