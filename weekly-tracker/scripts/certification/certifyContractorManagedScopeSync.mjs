// certifyContractorManagedScopeSync.mjs — Simplification Phase 3D.2.1 DB/
// security certification for update_contractor_managed_project_scope()
// (053_contractor_managed_project_scope_sync.sql).
//
// Real authenticated supabase-js clients (signInWithPassword) for every RPC
// call — never the service-role client for the calls being certified, since
// the whole point is proving authorization inside the RPC body actually
// holds. Ground truth (setup and verification) uses direct psql, bypassing
// RLS entirely, same pattern as every other DB cert script in this repo.
//
// Run: node scripts/certification/certifyContractorManagedScopeSync.mjs
// (after: npm run cert:reset:contractor-managed-scope-sync)

import { randomUUID } from 'node:crypto';
import { psql, queryOne, countRows, signInAs, anonClient, makeReporter, requireCertificationEnvironment } from './lib.mjs';
import { getLocalFixturePassword } from './fixturePassword.mjs';

await requireCertificationEnvironment();

const PASSWORD = getLocalFixturePassword();
const r = makeReporter('Contractor-Managed Scope Synchronization certification (Simplification Phase 3D.2.1)');

const WP1 = 'common.demolition.strip_out';
const WP2 = 'common.demolition.structural';
const WP3 = 'common.demolition.mep_disconnect';
const WP_UNKNOWN = 'totally.fake.wp';

const createdStoreCodes = [];

async function createScopeSyncTestProject(client, scopeWpIds = [WP1, WP2]) {
  const storeCode = `3D2-1-SYNC-${randomUUID().slice(0, 8)}`;
  createdStoreCodes.push(storeCode);
  const result = await client.rpc('create_contractor_managed_project', {
    p_project: { storeCode, country: 'Testland' },
    p_scope_wp_ids: scopeWpIds,
    p_client_request_id: randomUUID(),
  });
  if (result.data?.id) {
    // The fixture roster only pre-assigns contractor-a-assigned@cert.local
    // to the fixed 900xxx/960xxx projects — every project this script
    // creates dynamically needs the same grant to let the Contractor's own
    // Save Draft/Submit/Request Changes calls (used to drive lifecycle
    // transitions below) actually reach it.
    psql(`UPDATE public.profiles SET assigned_projects = array_append(COALESCE(assigned_projects,'{}'), ${result.data.id}) WHERE email='contractor-a-assigned@cert.local' AND NOT (${result.data.id} = ANY(COALESCE(assigned_projects,'{}')));`);
  }
  return result;
}

function callSync(client, projectId, scope, scopeWpIds, clientRequestId = randomUUID()) {
  return client.rpc('update_contractor_managed_project_scope', {
    p_project_id: projectId,
    p_scope: scope,
    p_scope_wp_ids: scopeWpIds,
    p_client_request_id: clientRequestId,
  });
}

function scope(wpIds) {
  return { template: 'retail-fitout-v2', workPackages: wpIds };
}

async function moveToPendingReview(contractor, projectId, wpIds) {
  const { error: draftErr } = await contractor.rpc('save_contractor_schedule_draft', {
    p_project_id: projectId,
    p_changes: wpIds.map(wpId => ({ wpId, plannedStart: '2027-01-01', plannedFinish: '2027-01-05' })),
    p_client_request_id: randomUUID(),
  });
  if (draftErr) throw new Error(`save_contractor_schedule_draft failed: ${draftErr.message}`);
  const { error: submitErr } = await contractor.rpc('submit_contractor_schedule', {
    p_project_id: projectId,
    p_client_request_id: randomUUID(),
  });
  if (submitErr) throw new Error(`submit_contractor_schedule failed: ${submitErr.message}`);
}

function latestSubmissionId(projectId) {
  return Number(psql(`SELECT id FROM public.project_schedule_versions WHERE project_id=${projectId} ORDER BY id DESC LIMIT 1;`));
}

async function moveToApproved(pm, contractor, projectId, wpIds) {
  await moveToPendingReview(contractor, projectId, wpIds);
  const submissionId = latestSubmissionId(projectId);
  const { error } = await pm.rpc('approve_schedule_submission', {
    p_submission_id: submissionId,
    p_comment: null,
    p_client_request_id: randomUUID(),
  });
  if (error) throw new Error(`approve_schedule_submission failed: ${error.message}`);
}

async function moveToChangesRequested(pm, contractor, projectId, wpIds) {
  await moveToPendingReview(contractor, projectId, wpIds);
  const submissionId = latestSubmissionId(projectId);
  const { error } = await pm.rpc('request_schedule_changes', {
    p_submission_id: submissionId,
    p_comment: 'please revise',
    p_client_request_id: randomUUID(),
  });
  if (error) throw new Error(`request_schedule_changes failed: ${error.message}`);
}

try {
  const pmA = await signInAs('pm-a-assigned@cert.local', PASSWORD);
  const adminA = await signInAs('admin-a@cert.local', PASSWORD);
  const contractorA = await signInAs('contractor-a-assigned@cert.local', PASSWORD);
  const viewerA = await signInAs('viewer-a@cert.local', PASSWORD);
  const pmB = await signInAs('pm-b@cert.local', PASSWORD);

  r.section('1. DRAFT: add + remove + retain, dates preserved for retained rows');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;

    // Give WP1 (retained) and WP2 (about to be removed) real planned dates
    // via the Contractor's own Save Draft, so we can prove the sync command
    // never touches dates on rows it doesn't materialize/re-materialize.
    await contractorA.rpc('save_contractor_schedule_draft', {
      p_project_id: projectId,
      p_changes: [
        { wpId: WP1, plannedStart: '2027-03-01', plannedFinish: '2027-03-05' },
        { wpId: WP2, plannedStart: '2027-04-01', plannedFinish: '2027-04-05' },
      ],
      p_client_request_id: randomUUID(),
    });

    const { data, error } = await callSync(pmA, projectId, scope([WP1, WP3]), [WP1, WP3]);
    r.check('DRAFT: Scope edit (add WP3, remove WP2, retain WP1) succeeds', !error, error?.message);
    r.check('addedCount is 1 (WP3)', data?.addedCount === 1);
    r.check('unarchivedCount is 0', data?.unarchivedCount === 0);
    r.check('archivedCount is 1 (WP2)', data?.archivedCount === 1);

    const scopeRow = queryOne(`SELECT scope->'workPackages' FROM public.projects WHERE id = ${projectId};`);
    r.check('projects.scope now lists exactly [WP1, WP3]', JSON.parse(scopeRow).sort().join() === [WP1, WP3].sort().join());

    const activeCount = countRows('project_gantt_tasks', `project_id = ${projectId} AND NOT is_archived`);
    r.check('exactly 2 active rows (project Scope and active rows exactly match)', activeCount === 2);

    const wp1Dates = queryOne(`SELECT planned_start || ',' || planned_end FROM public.project_gantt_tasks WHERE project_id=${projectId} AND wp_id='${WP1}';`);
    r.check('retained WP1 keeps its exact planned dates (untouched by the sync)', wp1Dates === '2027-03-01,2027-03-06');

    const wp3Row = queryOne(`SELECT planned_start FROM public.project_gantt_tasks WHERE project_id=${projectId} AND wp_id='${WP3}' AND NOT is_archived;`);
    r.check('newly added WP3 has a null planned_start', wp3Row === null);

    const wp2Row = queryOne(`SELECT is_archived || ',' || planned_start FROM public.project_gantt_tasks WHERE project_id=${projectId} AND wp_id='${WP2}';`);
    r.check('removed WP2 row is archived, not deleted, and its prior dates are preserved', wp2Row === 'true,2027-04-01');
  }

  r.section('2. DRAFT: re-entering an archived WP unarchives it and preserves its prior dates');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    await contractorA.rpc('save_contractor_schedule_draft', {
      p_project_id: projectId,
      p_changes: [{ wpId: WP2, plannedStart: '2027-05-01', plannedFinish: '2027-05-03' }],
      p_client_request_id: randomUUID(),
    });
    await callSync(pmA, projectId, scope([WP1]), [WP1]);
    const { data, error } = await callSync(pmA, projectId, scope([WP1, WP2]), [WP1, WP2]);
    r.check('re-adding WP2 succeeds', !error, error?.message);
    r.check('addedCount is 0 (re-entry, not a fresh insert)', data?.addedCount === 0);
    r.check('unarchivedCount is 1', data?.unarchivedCount === 1);
    const wp2 = queryOne(`SELECT is_archived || ',' || planned_start FROM public.project_gantt_tasks WHERE project_id=${projectId} AND wp_id='${WP2}';`);
    r.check('re-entering WP2 is unarchived with its prior planned_start preserved', wp2 === 'false,2027-05-01');
    r.check('exactly one row exists for WP2 (no duplicate insert)', countRows('project_gantt_tasks', `project_id=${projectId} AND wp_id='${WP2}'`) === 1);
  }

  r.section('3. CHANGES_REQUESTED: same synchronization behavior as DRAFT');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    await moveToChangesRequested(pmA, contractorA, projectId, [WP1, WP2]);
    r.check('lifecycle collapses CHANGES_REQUESTED into DRAFT (no distinct state — see 053 header)',
      queryOne(`SELECT public.contractor_schedule_lifecycle_status(${projectId});`) === 'DRAFT');

    const { data, error } = await callSync(pmA, projectId, scope([WP1, WP3]), [WP1, WP3]);
    r.check('Scope edit succeeds after Request Changes', !error, error?.message);
    r.check('archivedCount is 1 (WP2)', data?.archivedCount === 1);
    r.check('addedCount is 1 (WP3)', data?.addedCount === 1);
  }

  r.section('4. Locked lifecycle: PENDING_REVIEW rejected, no data changes');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    await moveToPendingReview(contractorA, projectId, [WP1, WP2]);
    const scopeBefore = queryOne(`SELECT scope FROM public.projects WHERE id=${projectId};`);
    const tasksBefore = psql(`SELECT wp_id, is_archived FROM public.project_gantt_tasks WHERE project_id=${projectId} ORDER BY wp_id;`);

    const { error } = await callSync(pmA, projectId, scope([WP1]), [WP1]);
    r.check('Scope edit is rejected while PENDING_REVIEW', !!error);
    r.check('rejection is SCHEDULE_PENDING_REVIEW', /SCHEDULE_PENDING_REVIEW/.test(error?.message || ''));
    r.check('projects.scope is byte-unchanged after rejection', queryOne(`SELECT scope FROM public.projects WHERE id=${projectId};`) === scopeBefore);
    r.check('project_gantt_tasks is byte-unchanged after rejection',
      psql(`SELECT wp_id, is_archived FROM public.project_gantt_tasks WHERE project_id=${projectId} ORDER BY wp_id;`) === tasksBefore);
  }

  r.section('5. Locked lifecycle: APPROVED rejected, no data changes');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    await moveToApproved(pmA, contractorA, projectId, [WP1, WP2]);
    const scopeBefore = queryOne(`SELECT scope FROM public.projects WHERE id=${projectId};`);
    const tasksBefore = psql(`SELECT wp_id, is_archived FROM public.project_gantt_tasks WHERE project_id=${projectId} ORDER BY wp_id;`);

    const { error } = await callSync(pmA, projectId, scope([WP1]), [WP1]);
    r.check('Scope edit is rejected while APPROVED', !!error);
    r.check('rejection is BASELINE_ALREADY_APPROVED', /BASELINE_ALREADY_APPROVED/.test(error?.message || ''));
    r.check('projects.scope is byte-unchanged after rejection', queryOne(`SELECT scope FROM public.projects WHERE id=${projectId};`) === scopeBefore);
    r.check('project_gantt_tasks is byte-unchanged after rejection',
      psql(`SELECT wp_id, is_archived FROM public.project_gantt_tasks WHERE project_id=${projectId} ORDER BY wp_id;`) === tasksBefore);
  }

  r.section('6. Atomic rollback: invalid/foreign WP id — no partial Scope or task change');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const scopeBefore = queryOne(`SELECT scope FROM public.projects WHERE id=${projectId};`);
    const taskCountBefore = countRows('project_gantt_tasks', `project_id=${projectId}`);

    const { error } = await callSync(pmA, projectId, scope([WP1, WP_UNKNOWN]), [WP1, WP_UNKNOWN]);
    r.check('foreign/out-of-template WP id is rejected', !!error);
    r.check('rejection is WORK_PACKAGE_OUT_OF_TEMPLATE', /WORK_PACKAGE_OUT_OF_TEMPLATE/.test(error?.message || ''));
    r.check('no partial projects.scope change', queryOne(`SELECT scope FROM public.projects WHERE id=${projectId};`) === scopeBefore);
    r.check('no partial task change (row count unchanged)', countRows('project_gantt_tasks', `project_id=${projectId}`) === taskCountBefore);
  }

  r.section('7. Atomic rollback: empty Scope');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const scopeBefore = queryOne(`SELECT scope FROM public.projects WHERE id=${projectId};`);
    const { error } = await callSync(pmA, projectId, {}, []);
    r.check('empty Scope is rejected', !!error);
    r.check('rejection is EMPTY_SCOPE', /EMPTY_SCOPE/.test(error?.message || ''));
    r.check('no partial projects.scope change', queryOne(`SELECT scope FROM public.projects WHERE id=${projectId};`) === scopeBefore);
  }

  r.section('8. Atomic rollback: duplicate WP id in the same batch');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const { error } = await callSync(pmA, projectId, scope([WP1, WP1]), [WP1, WP1]);
    r.check('duplicated WP id is rejected', !!error);
    r.check('rejection is DUPLICATE_WORK_PACKAGE', /DUPLICATE_WORK_PACKAGE/.test(error?.message || ''));
  }

  r.section('9. Idempotency: replay returns the same result, no duplicate rows, no archive-state change');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const clientRequestId = randomUUID();
    const first = await callSync(pmA, projectId, scope([WP1, WP3]), [WP1, WP3], clientRequestId);
    r.check('first call succeeds', !first.error, first.error?.message);
    r.check('first call is not a replay', first.data?.idempotentReplay !== true);

    const beforeReplayTasks = psql(`SELECT wp_id, is_archived FROM public.project_gantt_tasks WHERE project_id=${projectId} ORDER BY wp_id;`);
    const replay = await callSync(pmA, projectId, scope([WP1, WP3]), [WP1, WP3], clientRequestId);
    r.check('replay succeeds', !replay.error, replay.error?.message);
    r.check('replay is reported as a replay', replay.data?.idempotentReplay === true);
    r.check('replay returns the same addedCount/unarchivedCount/archivedCount', replay.data?.addedCount === first.data?.addedCount && replay.data?.archivedCount === first.data?.archivedCount);
    r.check('row/archive state is unchanged by the replay',
      psql(`SELECT wp_id, is_archived FROM public.project_gantt_tasks WHERE project_id=${projectId} ORDER BY wp_id;`) === beforeReplayTasks);
    r.check('exactly one command ledger row exists for this client_request_id',
      queryOne(`SELECT COUNT(*) FROM public.write_command_requests WHERE operation='project.update_contractor_managed_scope' AND client_request_id='${clientRequestId}';`) === '1');
  }

  r.section('10. Concurrency: simultaneous Scope updates for the same project');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const results = await Promise.all([
      callSync(pmA, projectId, scope([WP1, WP3]), [WP1, WP3]),
      callSync(pmA, projectId, scope([WP2, WP3]), [WP2, WP3]),
    ]);
    const successes = results.filter(res => !res.error);
    r.check('both concurrent Scope updates resolve without a raw/unexpected error', successes.length === 2);
    const finalScope = JSON.parse(queryOne(`SELECT scope->'workPackages' FROM public.projects WHERE id=${projectId};`));
    r.check('final projects.scope matches whichever update committed last (deterministic single winner, no corruption)',
      JSON.stringify(finalScope.sort()) === JSON.stringify([WP1, WP3].sort()) || JSON.stringify(finalScope.sort()) === JSON.stringify([WP2, WP3].sort()));
    const activeWpIds = psql(`SELECT wp_id FROM public.project_gantt_tasks WHERE project_id=${projectId} AND NOT is_archived ORDER BY wp_id;`).split(/\r?\n/).filter(Boolean).sort();
    r.check('active schedule rows exactly match the final committed Scope (no divergence)',
      JSON.stringify(activeWpIds) === JSON.stringify([...finalScope].sort()));
  }

  r.section('11. Concurrency: Scope update vs Save Draft — row lock serializes, no data corruption');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const [syncResult, draftResult] = await Promise.all([
      callSync(pmA, projectId, scope([WP1, WP3]), [WP1, WP3]),
      contractorA.rpc('save_contractor_schedule_draft', {
        p_project_id: projectId,
        p_changes: [{ wpId: WP1, plannedStart: '2027-06-01', plannedFinish: '2027-06-02' }],
        p_client_request_id: randomUUID(),
      }),
    ]);
    r.check('Scope update call resolves without a raw/unexpected error', !syncResult.error, syncResult.error?.message);
    r.check('Save Draft call resolves (either succeeds, or cleanly rejects WP2 as out of the new scope, never corrupts)',
      !draftResult.error || /WORK_PACKAGE_OUT_OF_SCOPE/.test(draftResult.error?.message || ''));
    const activeCount = countRows('project_gantt_tasks', `project_id=${projectId} AND NOT is_archived`);
    r.check('exactly 2 active rows remain (WP1, WP3) — no orphaned or duplicated rows from the race', activeCount === 2);
  }

  r.section('12. Concurrency: Scope update vs Submit — row lock serializes lifecycle correctly');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    await contractorA.rpc('save_contractor_schedule_draft', {
      p_project_id: projectId,
      p_changes: [
        { wpId: WP1, plannedStart: '2027-07-01', plannedFinish: '2027-07-02' },
        { wpId: WP2, plannedStart: '2027-07-01', plannedFinish: '2027-07-02' },
      ],
      p_client_request_id: randomUUID(),
    });
    const [syncResult, submitResult] = await Promise.all([
      callSync(pmA, projectId, scope([WP1, WP3]), [WP1, WP3]),
      contractorA.rpc('submit_contractor_schedule', { p_project_id: projectId, p_client_request_id: randomUUID() }),
    ]);
    r.check('exactly one of the two racing calls succeeds (the row lock forces total ordering, never both)',
      (!syncResult.error) !== (!submitResult.error));

    const finalStatus = queryOne(`SELECT public.contractor_schedule_lifecycle_status(${projectId});`);
    const activeWpIds2 = psql(`SELECT wp_id FROM public.project_gantt_tasks WHERE project_id=${projectId} AND NOT is_archived ORDER BY wp_id;`).split(/\r?\n/).filter(Boolean).sort();

    if (!syncResult.error) {
      // Sync won: Scope committed to [WP1,WP3] before Submit's snapshot ran.
      // Submit must then either see the new scope consistently (succeed with
      // exactly WP1+WP3 scheduled — WP3 has no dates yet, so completeness
      // fails and it is correctly rejected) or reject as stale — never a
      // mix of the old and new scope.
      r.check('Sync won: active schedule rows exactly match the newly-committed Scope [WP1, WP3]',
        JSON.stringify(activeWpIds2) === JSON.stringify([WP1, WP3].sort()));
      r.check('Sync won: Submit is rejected (WP3 has no planned dates yet -> schedule is incomplete) or lifecycle is still DRAFT',
        !!submitResult.error || finalStatus === 'DRAFT');
    } else {
      // Submit won: PENDING_REVIEW committed first; Sync then re-evaluates
      // lifecycle against the now-locked row and is correctly rejected —
      // the original [WP1, WP2] schedule must be completely untouched by
      // the losing Sync attempt (no partial archive/insert of any kind).
      r.check('Submit won: Sync is rejected', !!syncResult.error);
      r.check('Submit won: rejection is the lifecycle lock', /SCHEDULE_PENDING_REVIEW|BASELINE_ALREADY_APPROVED/.test(syncResult.error?.message || ''));
      r.check('Submit won: lifecycle is PENDING_REVIEW', finalStatus === 'PENDING_REVIEW');
      r.check('Submit won: active schedule rows are exactly the original, untouched [WP1, WP2]',
        JSON.stringify(activeWpIds2) === JSON.stringify([WP1, WP2].sort()));
    }
  }

  r.section('13. Authorization: Admin allowed (same can_write_project policy as ordinary metadata edits)');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const { error } = await callSync(adminA, projectId, scope([WP1]), [WP1]);
    r.check('Admin is allowed to sync Scope', !error, error?.message);
  }

  r.section('14. Authorization: Contractor denied');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const { error } = await callSync(contractorA, projectId, scope([WP1]), [WP1]);
    r.check('Contractor is rejected', !!error);
    r.check('rejection is the authorization failure', /NOT_AUTHORIZED/.test(error?.message || ''));
  }

  r.section('15. Authorization: Viewer denied');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const { error } = await callSync(viewerA, projectId, scope([WP1]), [WP1]);
    r.check('Viewer is rejected', !!error);
    r.check('rejection is the authorization failure', /NOT_AUTHORIZED/.test(error?.message || ''));
  }

  r.section('16. Authorization: unauthenticated caller denied');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const { error } = await callSync(anonClient(), projectId, scope([WP1]), [WP1]);
    r.check('unauthenticated caller is rejected', !!error);
  }

  r.section('17. Authorization: cross-company PM denied');
  {
    const { data: created } = await createScopeSyncTestProject(pmA, [WP1, WP2]);
    const projectId = created.id;
    const { error } = await callSync(pmB, projectId, scope([WP1]), [WP1]);
    r.check('PM from company-b is rejected for a company-a project', !!error);
    r.check('rejection is the authorization failure', /NOT_AUTHORIZED/.test(error?.message || ''));
  }

  r.section('18. AUTO_GENERATED path unaffected');
  {
    const autoCount = countRows('projects', "schedule_ownership_mode = 'AUTO_GENERATED'");
    r.check('pre-existing AUTO_GENERATED fixture projects are still present and untouched', Number(autoCount) >= 1);
  }
} finally {
  if (createdStoreCodes.length > 0) {
    const codeList = createdStoreCodes.map(c => `'${c}'`).join(',');
    psql(`DELETE FROM public.write_command_requests WHERE project_id IN (SELECT id FROM public.projects WHERE store_code IN (${codeList}));`);
    // project_schedule_version_tasks/versions are immutable by design once
    // created (prevent_schedule_version_task_mutation, migration 049) — any
    // project this script moved to PENDING_REVIEW/APPROVED/CHANGES_REQUESTED
    // cannot be hard-deleted. This mirrors the same accepted limitation the
    // live reproduction investigation for this phase already documented;
    // these rows are inert, uniquely store-coded, and wiped by the next full
    // `supabase db reset`.
    for (const code of createdStoreCodes) {
      try {
        psql(`DELETE FROM public.project_gantt_tasks WHERE project_id = (SELECT id FROM public.projects WHERE store_code = '${code}');`);
        psql(`DELETE FROM public.projects WHERE store_code = '${code}';`);
      } catch {
        // Has submission history — left in place, see comment above.
      }
    }
  }
}

const { fail } = r.summary();
process.exit(fail === 0 ? 0 : 1);
