// certifyContractorScheduleSubmissionLifecycle.mjs — Simplification Phase
// 4B.1 DB/security certification for the versioned schedule submission
// lifecycle: submit_contractor_schedule, request_schedule_changes,
// approve_schedule_submission (049_contractor_schedule_submission_lifecycle.sql)
// and save_contractor_schedule_draft's lifecycle lock
// (050_contractor_schedule_draft_lifecycle_lock.sql).
//
// Real authenticated supabase-js clients (signInWithPassword) for every RPC
// call — never the service-role client for the calls being certified, since
// the whole point is proving RLS/authorization inside the RPCs actually
// holds. Ground truth (setup and verification) uses direct psql, bypassing
// RLS entirely, same pattern as every other DB cert script in this repo.
//
// Reuses base fixtures.mjs's PROJECT_A/PROJECT_A2/PROJECT_B (900001-900003)
// exactly as certifyContractorScheduleDraft.mjs already does — temporarily
// flips ownership mode / grants assignment where needed, reverts everything
// in a finally block.
//
// Run: node scripts/certification/certifyContractorScheduleSubmissionLifecycle.mjs
// (after: npm run cert:reset:contractor-schedule)

import { randomUUID } from 'node:crypto';
import { loadFixtureState, psql, queryOne, signInAs, makeReporter, requireCertificationEnvironment } from './lib.mjs';

await requireCertificationEnvironment();

const state = loadFixtureState();
const PROJECT_A = state.projects.PROJECT_A;   // company-a, contractor-a-assigned IS assigned
const PROJECT_A2 = state.projects.PROJECT_A2; // company-a, left AUTO_GENERATED until step 8, then flipped
const PROJECT_B = state.projects.PROJECT_B;   // company-b, contractor-b / pm-b assigned
const PASSWORD = state.password;

const r = makeReporter('Contractor Schedule Submission Lifecycle certification (Simplification Phase 4B.1)');

async function callDraftRpc(client, projectId, changes, clientRequestId = randomUUID()) {
  return client.rpc('save_contractor_schedule_draft', {
    p_project_id: projectId, p_changes: changes, p_client_request_id: clientRequestId,
  });
}
async function callSubmit(client, projectId, clientRequestId = randomUUID(), comment = null) {
  return client.rpc('submit_contractor_schedule', {
    p_project_id: projectId, p_client_request_id: clientRequestId, p_contractor_comment: comment,
  });
}
async function callRequestChanges(client, submissionId, comment, clientRequestId = randomUUID()) {
  return client.rpc('request_schedule_changes', {
    p_submission_id: submissionId, p_comment: comment, p_client_request_id: clientRequestId,
  });
}
async function callApprove(client, submissionId, comment, clientRequestId = randomUUID()) {
  return client.rpc('approve_schedule_submission', {
    p_submission_id: submissionId, p_comment: comment, p_client_request_id: clientRequestId,
  });
}

function versionRow(id, cols = 'status,submission_number,baseline_revision_number') {
  const row = queryOne(`SELECT ${cols} FROM public.project_schedule_versions WHERE id = ${id};`);
  return row ? row.split('|') : null;
}

const COMPLETE_CHANGES = [
  { wpId: 'demo.walls',     plannedStart: '2027-01-01', plannedFinish: '2027-01-05' },
  { wpId: 'mep.electrical', plannedStart: '2027-01-06', plannedFinish: '2027-01-10' },
  { wpId: 'finish.paint',   plannedStart: '2027-01-11', plannedFinish: '2027-01-15' },
];

try {
  psql(`UPDATE public.projects SET schedule_ownership_mode = 'CONTRACTOR_MANAGED' WHERE id = ${PROJECT_A};`);

  const contractorAssigned = await signInAs('contractor-a-assigned@cert.local', PASSWORD);
  const contractorUnassigned = await signInAs('contractor-a-unassigned@cert.local', PASSWORD);
  const contractorB = await signInAs('contractor-b@cert.local', PASSWORD);
  const pmAAssigned = await signInAs('pm-a-assigned@cert.local', PASSWORD);
  const pmB = await signInAs('pm-b@cert.local', PASSWORD);
  const adminA = await signInAs('admin-a@cert.local', PASSWORD);
  const viewerA = await signInAs('viewer-a@cert.local', PASSWORD);

  let submission1Id, submission2Id, submission1ClientRequestId, race11WinnerSubmissionId;

  r.section('1. Assigned Contractor submits a complete Draft');
  {
    const draft = await callDraftRpc(contractorAssigned, PROJECT_A, COMPLETE_CHANGES);
    r.check('Save Draft succeeds for all 3 active WPs', !draft.error, draft.error?.message);

    submission1ClientRequestId = randomUUID();
    const { data, error } = await callSubmit(contractorAssigned, PROJECT_A, submission1ClientRequestId, 'v1 comment');
    r.check('submit_contractor_schedule succeeds', !error, error?.message);
    r.check('response reports submissionNumber=1', data?.submissionNumber === 1);
    r.check('response reports status=PENDING_REVIEW', data?.status === 'PENDING_REVIEW');
    r.check('response reports scheduledCount=3', data?.scheduledCount === 3);
    r.check('response is not a replay on first call', data?.idempotentReplay === false);
    submission1Id = data?.submissionId;
  }

  r.section('4. Snapshot contains exactly the current active Scope WPs (not archived)');
  {
    const wpIds = psql(
      `SELECT wp_id FROM public.project_schedule_version_tasks WHERE version_id = ${submission1Id} ORDER BY wp_id;`
    ).split(/\r?\n/).filter(Boolean);
    r.check('snapshot has exactly 3 rows', wpIds.length === 3);
    r.check('snapshot contains demo.walls, mep.electrical, finish.paint',
      ['demo.walls', 'finish.paint', 'mep.electrical'].every((id) => wpIds.includes(id)));
    r.check('snapshot excludes the archived legacy.archived WP', !wpIds.includes('legacy.archived'));
  }

  r.section('5. Snapshot rows are immutable (trigger-enforced, even for service-role-equivalent direct SQL)');
  {
    let updateFailed = false, deleteFailed = false;
    try {
      psql(`UPDATE public.project_schedule_version_tasks SET planned_start = '2099-01-01' WHERE version_id = ${submission1Id} AND wp_id = 'demo.walls';`);
    } catch (err) { updateFailed = /SCHEDULE_VERSION_TASK_IMMUTABLE/.test(String(err.message || err)); }
    r.check('direct UPDATE against a snapshot row is rejected by the immutability trigger', updateFailed);

    try {
      psql(`DELETE FROM public.project_schedule_version_tasks WHERE version_id = ${submission1Id} AND wp_id = 'demo.walls';`);
    } catch (err) { deleteFailed = /SCHEDULE_VERSION_TASK_IMMUTABLE/.test(String(err.message || err)); }
    r.check('direct DELETE against a snapshot row is rejected by the immutability trigger', deleteFailed);
  }

  r.section('6. Contractor cannot update snapshot/header directly (no client write grant exists)');
  {
    // Table-level UPDATE privilege is fully REVOKEd from authenticated for
    // both tables (migration 049) — not merely RLS-filtered — so this must
    // fail as a permission error at the grant level, not silently affect
    // zero rows.
    const headerUpdate = await contractorAssigned
      .from('project_schedule_versions')
      .update({ status: 'APPROVED' })
      .eq('id', submission1Id)
      .select();
    r.check('direct client UPDATE on the header table is rejected (no UPDATE grant)', !!headerUpdate.error);

    const taskUpdate = await contractorAssigned
      .from('project_schedule_version_tasks')
      .update({ planned_start: '2099-01-01' })
      .eq('version_id', submission1Id)
      .select();
    r.check('direct client UPDATE on the task snapshot table is rejected (no UPDATE grant)', !!taskUpdate.error);
  }

  r.section('7. Unassigned Contractor cannot submit');
  {
    const { error } = await callSubmit(contractorUnassigned, PROJECT_A);
    r.check('unassigned contractor is rejected', !!error);
  }

  r.section('8. Contractor cannot submit an AUTO_GENERATED project');
  {
    psql(`UPDATE public.profiles SET assigned_projects = array_append(COALESCE(assigned_projects, '{}'::integer[]), ${PROJECT_A2})
          WHERE id = (SELECT id FROM auth.users WHERE email = 'contractor-a-assigned@cert.local');`);
    const { error } = await callSubmit(contractorAssigned, PROJECT_A2);
    r.check('submit against an AUTO_GENERATED project is rejected', !!error);
    r.check('rejection is SCHEDULE_NOT_CONTRACTOR_MANAGED', /SCHEDULE_NOT_CONTRACTOR_MANAGED/.test(error?.message || ''));
  }

  r.section('9. Cross-company Contractor cannot submit');
  {
    const { error } = await callSubmit(contractorB, PROJECT_A);
    r.check('cross-company contractor is rejected', !!error);
  }

  r.section('2. Incomplete Draft submission rejected (some active WPs missing Start/Finish)');
  {
    psql(`UPDATE public.projects SET schedule_ownership_mode = 'CONTRACTOR_MANAGED' WHERE id = ${PROJECT_A2};`);
    const draft = await callDraftRpc(contractorAssigned, PROJECT_A2, [
      { wpId: 'demo.walls', plannedStart: '2027-02-01', plannedFinish: '2027-02-03' },
      { wpId: 'mep.electrical', plannedStart: '2027-02-04', plannedFinish: '2027-02-06' },
      // finish.paint deliberately left unscheduled.
    ]);
    r.check('partial Save Draft succeeds (an incomplete Draft may be saved)', !draft.error, draft.error?.message);

    const { error } = await callSubmit(contractorAssigned, PROJECT_A2);
    r.check('submit is rejected while any active WP is incomplete', !!error);
    r.check('rejection is SCHEDULE_INCOMPLETE', /SCHEDULE_INCOMPLETE/.test(error?.message || ''));
    r.check('no version header was created by the rejected attempt',
      queryOne(`SELECT count(*) FROM public.project_schedule_versions WHERE project_id = ${PROJECT_A2};`) === '0');
  }

  r.section('3. All-unscheduled Draft submission rejected (zero WPs have Start/Finish)');
  {
    psql(`UPDATE public.projects SET schedule_ownership_mode = 'CONTRACTOR_MANAGED' WHERE id = ${PROJECT_B};`);
    const { error } = await callSubmit(contractorB, PROJECT_B);
    r.check('submit is rejected when every active WP is unscheduled', !!error);
    r.check('rejection is SCHEDULE_INCOMPLETE (3 of 3 incomplete), not EMPTY_SCOPE', /SCHEDULE_INCOMPLETE/.test(error?.message || ''));
  }

  r.section('10. Submit replay with the SAME client_request_id is idempotent');
  {
    // True replay: reuse step 1's exact client_request_id.
    const replay = await callSubmit(contractorAssigned, PROJECT_A, submission1ClientRequestId, 'v1 comment');
    r.check('replay with the same client_request_id succeeds (does not error)', !replay.error, replay.error?.message);
    r.check('replay is reported as a replay', replay.data?.idempotentReplay === true);
    r.check('replay returns the same submissionId as the original call', replay.data?.submissionId === submission1Id);
    r.check('replay returns the same submissionNumber', replay.data?.submissionNumber === 1);
    r.check('exactly one project_schedule_versions row exists for PROJECT_A (no duplicate from the replay)',
      queryOne(`SELECT count(*) FROM public.project_schedule_versions WHERE project_id = ${PROJECT_A};`) === '1');

    // A genuinely NEW client_request_id, by contrast, must be rejected —
    // PROJECT_A is still PENDING_REVIEW from step 1, so this is a distinct
    // (non-replay) second submit attempt, not idempotency.
    const distinct = await callSubmit(contractorAssigned, PROJECT_A);
    r.check('a distinct (non-replay) second submit attempt is rejected while still PENDING_REVIEW', !!distinct.error);
    r.check('rejection is SCHEDULE_PENDING_REVIEW, not a duplicate header', /SCHEDULE_PENDING_REVIEW/.test(distinct.error?.message || ''));
    r.check('still exactly one project_schedule_versions row exists for PROJECT_A',
      queryOne(`SELECT count(*) FROM public.project_schedule_versions WHERE project_id = ${PROJECT_A};`) === '1');
  }

  r.section('12. Save Draft rejected while PENDING_REVIEW');
  {
    const { error } = await callDraftRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2027-03-01', plannedFinish: '2027-03-03' },
    ]);
    r.check('Save Draft is rejected during PENDING_REVIEW', !!error);
    r.check('rejection is SCHEDULE_PENDING_REVIEW', /SCHEDULE_PENDING_REVIEW/.test(error?.message || ''));
  }

  r.section('13. PM requests changes with a mandatory comment');
  {
    const empty = await callRequestChanges(pmAAssigned, submission1Id, '');
    r.check('empty comment is rejected', !!empty.error);
    r.check('rejection is COMMENT_REQUIRED', /COMMENT_REQUIRED/.test(empty.error?.message || ''));

    const { data, error } = await callRequestChanges(pmAAssigned, submission1Id, 'Please adjust Demo Walls timing.');
    r.check('request_schedule_changes succeeds with a real comment', !error, error?.message);
    r.check('status becomes CHANGES_REQUESTED', data?.status === 'CHANGES_REQUESTED');
    const row = versionRow(submission1Id);
    r.check('ground truth: status is CHANGES_REQUESTED', row?.[0] === 'CHANGES_REQUESTED');
  }

  r.section('14. Contractor Draft becomes editable again after CHANGES_REQUESTED');
  {
    const { error } = await callDraftRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2027-04-01', plannedFinish: '2027-04-04' },
    ]);
    r.check('Save Draft succeeds once the submission is CHANGES_REQUESTED', !error, error?.message);
  }

  r.section('15. The previous (CHANGES_REQUESTED) snapshot remains exactly as originally submitted');
  {
    const row = queryOne(
      `SELECT planned_start FROM public.project_schedule_version_tasks WHERE version_id = ${submission1Id} AND wp_id = 'demo.walls';`
    );
    r.check('snapshot still holds the ORIGINAL submitted date, not the post-CHANGES_REQUESTED Draft edit', row === '2027-01-01');
  }

  r.section('16. Contractor resubmits and receives the next submission_number');
  {
    const { data, error } = await callSubmit(contractorAssigned, PROJECT_A, randomUUID(), 'v2 comment');
    r.check('resubmit succeeds', !error, error?.message);
    r.check('submissionNumber is 2, not reused from the returned submission', data?.submissionNumber === 2);
    r.check('status is PENDING_REVIEW again', data?.status === 'PENDING_REVIEW');
    submission2Id = data?.submissionId;
    r.check('two distinct submission rows now exist for PROJECT_A',
      queryOne(`SELECT count(*) FROM public.project_schedule_versions WHERE project_id = ${PROJECT_A};`) === '2');
  }

  r.section('21. Contractor cannot approve or request changes on their own submission');
  {
    const approveAttempt = await callApprove(contractorAssigned, submission2Id, 'self-approve');
    r.check('Contractor cannot approve', !!approveAttempt.error);
    const rcAttempt = await callRequestChanges(contractorAssigned, submission2Id, 'self-request-changes');
    r.check('Contractor cannot request changes', !!rcAttempt.error);
  }

  r.section('22. Admin cannot approve or request changes (no implicit override)');
  {
    const approveAttempt = await callApprove(adminA, submission2Id, 'admin-approve');
    r.check('Admin cannot approve, despite passing can_write_project()', !!approveAttempt.error);
    const rcAttempt = await callRequestChanges(adminA, submission2Id, 'admin-request-changes');
    r.check('Admin cannot request changes', !!rcAttempt.error);
  }

  r.section('23. Viewer cannot approve or request changes');
  {
    const approveAttempt = await callApprove(viewerA, submission2Id, 'viewer-approve');
    r.check('Viewer cannot approve', !!approveAttempt.error);
    const rcAttempt = await callRequestChanges(viewerA, submission2Id, 'viewer-request-changes');
    r.check('Viewer cannot request changes', !!rcAttempt.error);
  }

  r.section('24. Cross-company PM cannot review');
  {
    const approveAttempt = await callApprove(pmB, submission2Id, 'cross-company-approve');
    r.check('cross-company PM cannot approve', !!approveAttempt.error);
    const rcAttempt = await callRequestChanges(pmB, submission2Id, 'cross-company-request-changes');
    r.check('cross-company PM cannot request changes', !!rcAttempt.error);
  }

  r.section('25. Guessed submission ID does not leak existence');
  {
    const nonexistent = await callRequestChanges(pmAAssigned, 999999999, 'guessed id');
    r.check('a nonexistent submission id is rejected', !!nonexistent.error);

    // submission2Id is real and company-a-accessible to pmAAssigned, but
    // NOT to pmB (company-b) — the leak-proof is that "doesn't exist" and
    // "exists but belongs to a company I can't see" produce the IDENTICAL
    // generic error, so a caller can never distinguish the two cases.
    const realButWrongCompany = await callRequestChanges(pmB, submission2Id, 'cross-company guessed');
    r.check('nonexistent-id error and real-but-inaccessible-id error are the identical generic message (no existence leak)',
      nonexistent.error?.message === realButWrongCompany.error?.message);
  }

  r.section('17. PM approves');
  {
    const { data, error } = await callApprove(pmAAssigned, submission2Id, 'Looks good.');
    r.check('approve_schedule_submission succeeds', !error, error?.message);
    r.check('status becomes APPROVED', data?.status === 'APPROVED');
    r.check('response reports baselineRevisionNumber', typeof data?.baselineRevisionNumber === 'number');
  }

  r.section('18. First approved submission receives baseline_revision_number = 1 (never overloaded with submission_number)');
  {
    const row = versionRow(submission2Id);
    r.check('ground truth: status is APPROVED', row?.[0] === 'APPROVED');
    r.check('ground truth: submission_number is still 2 (unchanged)', row?.[1] === '2');
    r.check('ground truth: baseline_revision_number is 1 (the FIRST approval ever, despite submission_number=2)', row?.[2] === '1');
  }

  r.section('19. Save Draft rejected after APPROVED');
  {
    const { error } = await callDraftRpc(contractorAssigned, PROJECT_A, [
      { wpId: 'demo.walls', plannedStart: '2027-05-01', plannedFinish: '2027-05-03' },
    ]);
    r.check('Save Draft is rejected once a baseline is approved', !!error);
    r.check('rejection is BASELINE_ALREADY_APPROVED', /BASELINE_ALREADY_APPROVED/.test(error?.message || ''));
  }

  r.section('20. Canonical lifecycle helper reports APPROVED (Scope-edit orchestration would see this as blocked)');
  {
    const status = queryOne(`SELECT public.contractor_schedule_lifecycle_status(${PROJECT_A});`);
    r.check('contractor_schedule_lifecycle_status returns APPROVED', status === 'APPROVED');
  }

  r.section('11. Two concurrent Submit calls for the same (fresh) project produce exactly one pending submission');
  {
    // A fresh CONTRACTOR_MANAGED project state: complete PROJECT_A2's Draft
    // (left incomplete by step 2 on purpose) so a genuine race can be fired.
    await callDraftRpc(contractorAssigned, PROJECT_A2, [
      { wpId: 'finish.paint', plannedStart: '2027-06-01', plannedFinish: '2027-06-03' },
    ]);
    const [a, b] = await Promise.all([
      callSubmit(contractorAssigned, PROJECT_A2, randomUUID(), 'race A'),
      callSubmit(contractorAssigned, PROJECT_A2, randomUUID(), 'race B'),
    ]);
    const successes = [a, b].filter((res) => !res.error);
    const failures = [a, b].filter((res) => !!res.error);
    r.check('exactly one of the two concurrent submits succeeds', successes.length === 1);
    r.check('exactly one of the two concurrent submits fails', failures.length === 1);
    r.check('the losing attempt fails with SCHEDULE_PENDING_REVIEW, not a raw constraint error',
      /SCHEDULE_PENDING_REVIEW/.test(failures[0]?.error?.message || ''));
    r.check('exactly one PENDING_REVIEW row exists for PROJECT_A2',
      queryOne(`SELECT count(*) FROM public.project_schedule_versions WHERE project_id = ${PROJECT_A2} AND status = 'PENDING_REVIEW';`) === '1');

    race11WinnerSubmissionId = successes[0]?.data?.submissionId;
  }

  r.section('26. Approve and Request Changes racing the same submission produce exactly one valid terminal result');
  {
    const submissionId = race11WinnerSubmissionId;
    const [approveRes, rcRes] = await Promise.all([
      callApprove(pmAAssigned, submissionId, 'race approve'),
      callRequestChanges(pmAAssigned, submissionId, 'race request changes'),
    ]);
    const successes = [approveRes, rcRes].filter((res) => !res.error);
    const failures = [approveRes, rcRes].filter((res) => !!res.error);
    r.check('exactly one of Approve/RequestChanges succeeds', successes.length === 1);
    r.check('exactly one of Approve/RequestChanges fails', failures.length === 1);
    r.check('the losing decision fails with SUBMISSION_NOT_PENDING', /SUBMISSION_NOT_PENDING/.test(failures[0]?.error?.message || ''));
    const finalStatus = queryOne(`SELECT status FROM public.project_schedule_versions WHERE id = ${submissionId};`);
    r.check('final status is a single deterministic terminal state (APPROVED or CHANGES_REQUESTED, not corrupted)',
      finalStatus === 'APPROVED' || finalStatus === 'CHANGES_REQUESTED');
  }

  r.section('27. Protected operational fields never exist in the snapshot table (schema-level proof)');
  {
    const cols = psql(
      `SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_schema='public' AND table_name='project_schedule_version_tasks';`
    );
    for (const forbidden of ['actual_progress', 'status', 'is_critical', 'is_archived', 'actual_start', 'actual_end']) {
      r.check(`snapshot table has no "${forbidden}" column`, !cols.split(',').includes(forbidden));
    }
    r.check('snapshot table has exactly the 4 schedule fields plus identity columns',
      ['id', 'version_id', 'wp_id', 'planned_start', 'planned_end', 'duration_days'].every((c) => cols.split(',').includes(c)));
  }
} finally {
  // Critical: project_schedule_versions/project_schedule_version_tasks rows
  // created by this script are NOT reverted by resetting
  // schedule_ownership_mode — a leftover PENDING_REVIEW/APPROVED row for
  // these shared fixture projects would make save_contractor_schedule_draft's
  // lifecycle lock (050) reject every subsequent script that reuses
  // PROJECT_A/PROJECT_A2/PROJECT_B (e.g. certifyContractorScheduleDraft.mjs),
  // even after ownership mode is reverted to AUTO_GENERATED. Delete them
  // explicitly. The immutability trigger (by design) blocks ANY delete of a
  // snapshot row, including one arriving via the header's ON DELETE CASCADE —
  // that guarantee is exactly correct for the application (an approved
  // Baseline must never be removable), so it is deliberately, narrowly
  // suspended here ONLY as the local postgres superuser, ONLY to restore
  // shared fixture state between cert script runs — no application code
  // path can do this.
  psql(`ALTER TABLE public.project_schedule_version_tasks DISABLE TRIGGER project_schedule_version_tasks_immutable;`);
  psql(`DELETE FROM public.project_schedule_versions WHERE project_id IN (${PROJECT_A}, ${PROJECT_A2}, ${PROJECT_B});`);
  psql(`ALTER TABLE public.project_schedule_version_tasks ENABLE TRIGGER project_schedule_version_tasks_immutable;`);
  psql(`UPDATE public.projects SET schedule_ownership_mode = 'AUTO_GENERATED' WHERE id IN (${PROJECT_A}, ${PROJECT_A2}, ${PROJECT_B});`);
  psql(`UPDATE public.profiles SET assigned_projects = array_remove(assigned_projects, ${PROJECT_A2})
        WHERE id = (SELECT id FROM auth.users WHERE email = 'contractor-a-assigned@cert.local');`);
}

const { fail } = r.summary();
process.exit(fail === 0 ? 0 : 1);
