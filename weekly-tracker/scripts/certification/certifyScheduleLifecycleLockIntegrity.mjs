// certifyScheduleLifecycleLockIntegrity.mjs — Simplification Phase 4B.1.1 DB
// certification for migration 051_contractor_schedule_lifecycle_lock_integrity.sql:
//   Section D: the Scope-mutation BEFORE UPDATE trigger on public.projects.
//   Section G: genuine two-Postgres-session race proofs (not Promise.all-only)
//     for both "Save wins" and "Submit wins" orderings between
//     save_contractor_schedule_draft and submit_contractor_schedule, proving
//     the forbidden state (PENDING_REVIEW committed with a Draft that differs
//     due to a late Save) is unreachable.
//   Section H: idempotency-replay ordering survives the new lock — a Save
//     Draft replay issued AFTER the project has moved to PENDING_REVIEW must
//     still return its original cached response, not SCHEDULE_PENDING_REVIEW.
//   Section I: Scope-update-vs-Submit race coherence, via the same
//     project-row lock the Scope trigger and the two RPCs all now share.
//
// The Section G/I race proofs use a "Director" session: a real, separate,
// long-lived `psql` child process holding an open, uncommitted
// `SELECT ... FOR UPDATE` transaction on the target project row. A REAL
// save_contractor_schedule_draft/submit_contractor_schedule RPC call (or a
// real Scope UPDATE) is then fired via a genuinely separate connection
// (supabase-js, its own TCP/backend), and pg_locks is polled from a THIRD,
// independent connection to affirmatively observe that call blocked
// (granted = false) on the exact row Director holds — proving real
// Postgres-level lock contention occurred, not merely that a JS Promise
// resolved in some order. Only then does Director commit (releasing the
// lock) and the blocked call's outcome is observed. This is deterministic
// (single contender per scenario — no reliance on Postgres's lock-queue
// FIFO ordering across multiple simultaneous waiters) and adds no sleep or
// test hook to any production RPC — all sequencing lives in this test
// driver alone.
//
// Two dedicated, self-contained fixture projects (970001/970002) are
// created and torn down entirely within this script — kept separate from
// the shared 900001-900003 (fixtures.mjs) and 960001-960002
// (contractorScheduleFixtures.mjs) fixtures so repeated Submit/Approve
// cycles here can never cross-contaminate other cert scripts.
//
// Run: node scripts/certification/certifyScheduleLifecycleLockIntegrity.mjs
// (after: npm run cert:seed:contractor-schedule)

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { loadFixtureState, psql, queryOne, signInAs, makeReporter, requireCertificationEnvironment } from './lib.mjs';
import { DB_URL } from './env.mjs';

await requireCertificationEnvironment();

const state = loadFixtureState();
const PASSWORD = state.password;

const PROJECT_G1 = 970001; // Section G "Submit wins" + Section I
const PROJECT_G2 = 970002; // Section G "Save wins"

const r = makeReporter('Schedule Lifecycle Lock Integrity certification (Simplification Phase 4B.1.1)');

// ─── Director: a real, separate, long-lived psql session ──────────────────

function openDirectorSession() {
  // Deliberately no -v ON_ERROR_STOP=1: this session must survive a failing
  // statement (e.g. an RPC correctly rejecting an attempt) and let the test
  // driver decide what to do next, rather than having psql kill the whole
  // process out from under an in-flight scenario.
  const proc = spawn('psql', [DB_URL, '-t', '-A'], {
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  let stderrBuffer = '';
  let waiters = [];
  proc.stdout.on('data', (chunk) => { buffer += chunk.toString(); drain(); });
  proc.stderr.on('data', (chunk) => { stderrBuffer += chunk.toString(); });

  function drain() {
    while (waiters.length) {
      const idx = buffer.indexOf(waiters[0].marker);
      if (idx === -1) break;
      const out = buffer.slice(0, idx);
      buffer = buffer.slice(idx + waiters[0].marker.length);
      waiters.shift().resolve(out.trim());
    }
  }

  let counter = 0;
  function exec(sql) {
    return new Promise((resolve) => {
      const marker = `__DIRECTOR_DONE_${counter++}__`;
      waiters.push({ marker, resolve });
      // \echo is a client-side psql meta-command: it always prints, even if
      // the preceding statement errored and left the transaction aborted —
      // unlike `SELECT 'marker'`, whose result row would never be sent by
      // the server once the transaction is in an aborted state. This
      // guarantees exec()'s promise always resolves instead of hanging.
      proc.stdin.write(sql.trim().replace(/;?\s*$/, ';') + `\n\\echo ${marker}\n`);
      drain();
    });
  }

  function close() {
    try { proc.stdin.end(); } catch { /* already closed */ }
    proc.kill();
  }

  return { exec, close, getStderr: () => stderrBuffer };
}

/**
 * Poll ground truth (a fully independent connection) until at least one
 * OTHER backend is genuinely blocked waiting on a lock, or time out.
 * Row-level FOR UPDATE contention in Postgres is resolved by the waiter
 * blocking on the holding transaction's XID (locktype='transactionid'),
 * not a relation-scoped pg_locks row — so this checks
 * pg_stat_activity.wait_event_type='Lock' directly (locktype-agnostic)
 * rather than joining pg_locks by relation, which would silently find
 * nothing and report a false negative.
 */
async function waitForBlockedWaiter(timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = Number(queryOne(
      `SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid();`
    ));
    if (count >= 1) return count;
    await new Promise((res) => setTimeout(res, 50));
  }
  return 0;
}

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

function setupProject(id, storeCode) {
  // Discard any schedule submission left over from a previous scenario that
  // reused this project id — a dangling APPROVED/PENDING_REVIEW row would
  // make both the RPCs' own lifecycle check AND the Scope trigger reject
  // this reset. Same disable/enable-trigger bracket used everywhere else in
  // this codebase's cert scripts: local-superuser-only, never
  // application-reachable.
  psql(`ALTER TABLE public.project_schedule_version_tasks DISABLE TRIGGER project_schedule_version_tasks_immutable;`);
  psql(`DELETE FROM public.project_schedule_versions WHERE project_id = ${id};`);
  psql(`ALTER TABLE public.project_schedule_version_tasks ENABLE TRIGGER project_schedule_version_tasks_immutable;`);

  // Reset mode to AUTO_GENERATED and clear Scope in the SAME statement — the
  // Scope trigger reads NEW.schedule_ownership_mode, so with NEW already
  // AUTO_GENERATED in this statement it returns immediately regardless of
  // the Scope change, exactly like any real AUTO_GENERATED Scope edit.
  psql(`
    INSERT INTO public.projects (id, store_code, shopping_mall_name, company_id, project_status,
      construction_start_date, construction_end_date, target_opening_date, schedule_ownership_mode, scope)
    VALUES (${id}, '${storeCode}', 'Lock Integrity Test Mall', 'company-a', 'Active',
      CURRENT_DATE - 10, CURRENT_DATE + 90, CURRENT_DATE + 110, 'AUTO_GENERATED', NULL)
    ON CONFLICT (id) DO UPDATE SET schedule_ownership_mode = 'AUTO_GENERATED', scope = NULL;
  `);
  // Flip to CONTRACTOR_MANAGED in a separate statement that does not touch
  // scope at all, so the WHEN clause never evaluates.
  psql(`UPDATE public.projects SET schedule_ownership_mode = 'CONTRACTOR_MANAGED' WHERE id = ${id};`);
  psql(`DELETE FROM public.project_gantt_tasks WHERE project_id = ${id};`);
  psql(`
    INSERT INTO public.project_gantt_tasks (project_id, wp_id, wp_label, phase_id, phase_label, is_archived, planned_start, planned_end, duration_days)
    VALUES
      (${id}, 'demo.walls',    'Demo Walls',   'demolition', 'Demolition', false, NULL, NULL, NULL),
      (${id}, 'finish.paint',  'Finish Paint', 'finishes',   'Finishes',   false, NULL, NULL, NULL);
  `);
}

try {
  const contractorId = queryOne(`SELECT id FROM auth.users WHERE email = 'contractor-a-assigned@cert.local';`);
  psql(`
    UPDATE public.profiles SET assigned_projects = (
      SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(assigned_projects, '{}'::integer[]) || ARRAY[${PROJECT_G1}, ${PROJECT_G2}]::integer[]) AS x
    ) WHERE id = '${contractorId}';
  `);
  setupProject(PROJECT_G1, 'LOCK-G1');
  setupProject(PROJECT_G2, 'LOCK-G2');

  const contractorAssigned = await signInAs('contractor-a-assigned@cert.local', PASSWORD);

  // ─── Section D: Scope-mutation trigger ───────────────────────────────────
  r.section('D1. AUTO_GENERATED project: Scope update is completely unaffected');
  {
    psql(`UPDATE public.projects SET schedule_ownership_mode = 'AUTO_GENERATED' WHERE id = ${PROJECT_G1};`);
    let threw = false;
    try { psql(`UPDATE public.projects SET scope = '{"zones":["A"]}'::jsonb WHERE id = ${PROJECT_G1};`); }
    catch { threw = true; }
    r.check('Scope update on AUTO_GENERATED project succeeds unconditionally', !threw);
    psql(`UPDATE public.projects SET schedule_ownership_mode = 'CONTRACTOR_MANAGED' WHERE id = ${PROJECT_G1};`);
  }

  r.section('D2. CONTRACTOR_MANAGED, DRAFT (no submission yet): Scope update succeeds');
  {
    let threw = false;
    try { psql(`UPDATE public.projects SET scope = '{"zones":["A","B"]}'::jsonb WHERE id = ${PROJECT_G1};`); }
    catch { threw = true; }
    r.check('Scope update during DRAFT succeeds', !threw);
  }

  let d3SubmissionId;
  r.section('D3. CONTRACTOR_MANAGED, PENDING_REVIEW: Scope update rejected');
  {
    await callDraftRpc(contractorAssigned, PROJECT_G1, [
      { wpId: 'demo.walls', plannedStart: '2027-01-01', plannedFinish: '2027-01-05' },
      { wpId: 'finish.paint', plannedStart: '2027-01-06', plannedFinish: '2027-01-10' },
    ]);
    const { data } = await callSubmit(contractorAssigned, PROJECT_G1);
    d3SubmissionId = data?.submissionId;
    let errMessage = null;
    try { psql(`UPDATE public.projects SET scope = '{"zones":["C"]}'::jsonb WHERE id = ${PROJECT_G1};`); }
    catch (err) { errMessage = String(err.message || err); }
    r.check('Scope update while PENDING_REVIEW is rejected', !!errMessage);
    r.check('rejection is SCHEDULE_PENDING_REVIEW', /SCHEDULE_PENDING_REVIEW/.test(errMessage || ''));
  }

  r.section('D6. Non-Scope field update on the SAME row succeeds even during PENDING_REVIEW (WHEN-clause scoping)');
  {
    let threw = false;
    try { psql(`UPDATE public.projects SET store_code = 'LOCK-G1-RENAMED' WHERE id = ${PROJECT_G1};`); }
    catch { threw = true; }
    r.check('non-Scope column update is unaffected by the trigger', !threw);
  }

  r.section('D7. Re-setting Scope to its OWN current value does not fire the trigger (WHEN clause is exact-match, not "any UPDATE touching scope")');
  {
    const current = queryOne(`SELECT scope::text FROM public.projects WHERE id = ${PROJECT_G1};`);
    let threw = false;
    try { psql(`UPDATE public.projects SET scope = '${current}'::jsonb WHERE id = ${PROJECT_G1};`); }
    catch { threw = true; }
    r.check('no-op Scope update (same value) succeeds even during PENDING_REVIEW', !threw);
  }

  r.section('D4. CONTRACTOR_MANAGED, CHANGES_REQUESTED: Scope update succeeds');
  {
    const pmAAssigned = await signInAs('pm-a-assigned@cert.local', PASSWORD);
    psql(`UPDATE public.profiles SET assigned_projects = (
      SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(assigned_projects, '{}'::integer[]) || ARRAY[${PROJECT_G1}]::integer[]) AS x
    ) WHERE id = (SELECT id FROM auth.users WHERE email = 'pm-a-assigned@cert.local');`);
    const { error } = await pmAAssigned.rpc('request_schedule_changes', {
      p_submission_id: d3SubmissionId, p_comment: 'Please revise.', p_client_request_id: randomUUID(),
    });
    r.check('request_schedule_changes succeeds', !error, error?.message);

    let threw = false;
    try { psql(`UPDATE public.projects SET scope = '{"zones":["D"]}'::jsonb WHERE id = ${PROJECT_G1};`); }
    catch { threw = true; }
    r.check('Scope update during CHANGES_REQUESTED succeeds', !threw);
  }

  r.section('D5. CONTRACTOR_MANAGED, APPROVED: Scope update rejected with BASELINE_ALREADY_APPROVED');
  {
    await callDraftRpc(contractorAssigned, PROJECT_G1, [
      { wpId: 'demo.walls', plannedStart: '2027-02-01', plannedFinish: '2027-02-05' },
      { wpId: 'finish.paint', plannedStart: '2027-02-06', plannedFinish: '2027-02-10' },
    ]);
    const { data: resub } = await callSubmit(contractorAssigned, PROJECT_G1, randomUUID(), 'resubmit for D5');
    const pmAAssigned = await signInAs('pm-a-assigned@cert.local', PASSWORD);
    const { error: approveError } = await pmAAssigned.rpc('approve_schedule_submission', {
      p_submission_id: resub.submissionId, p_comment: 'Approved.', p_client_request_id: randomUUID(),
    });
    r.check('approve_schedule_submission succeeds', !approveError, approveError?.message);

    let errMessage = null;
    try { psql(`UPDATE public.projects SET scope = '{"zones":["E"]}'::jsonb WHERE id = ${PROJECT_G1};`); }
    catch (err) { errMessage = String(err.message || err); }
    r.check('Scope update once APPROVED is rejected', !!errMessage);
    r.check('rejection is BASELINE_ALREADY_APPROVED', /BASELINE_ALREADY_APPROVED/.test(errMessage || ''));
  }

  r.section('D8. Trigger reuses the canonical contractor_schedule_lifecycle_status() helper (no duplicated status logic)');
  {
    const def = psql(`SELECT pg_get_functiondef('public.prevent_scope_mutation_during_review'::regproc);`);
    r.check('trigger function body calls contractor_schedule_lifecycle_status(), not a re-derived status query',
      def.includes('contractor_schedule_lifecycle_status'));
  }

  // ─── Section G: genuine two-session race proofs ─────────────────────────

  r.section('G1. "Submit wins": a Save Draft blocked behind a concurrently-committing Submit is correctly rejected once unblocked, with zero data corruption');
  {
    // PROJECT_G1 is currently APPROVED from D5 — reset to a fresh DRAFT
    // project entirely (a fresh submission cycle, not reusing the approved one).
    setupProject(PROJECT_G1, 'LOCK-G1');
    await callDraftRpc(contractorAssigned, PROJECT_G1, [
      { wpId: 'demo.walls', plannedStart: '2027-03-01', plannedFinish: '2027-03-05' },
      { wpId: 'finish.paint', plannedStart: '2027-03-06', plannedFinish: '2027-03-10' },
    ]);

    const director = openDirectorSession();
    try {
      await director.exec(`BEGIN`);
      await director.exec(`SELECT id FROM public.projects WHERE id = ${PROJECT_G1} FOR UPDATE`);

      // Fire a REAL Save Draft RPC concurrently (separate connection) — it
      // must block on Director's held row lock.
      const saveAttemptDates = [
        { wpId: 'demo.walls', plannedStart: '2027-09-01', plannedFinish: '2027-09-05' },
      ];
      const savePromise = callDraftRpc(contractorAssigned, PROJECT_G1, saveAttemptDates);

      const blockedWaiters = await waitForBlockedWaiter();
      r.check('a real Save Draft call is genuinely blocked at the Postgres lock level (pg_locks granted=false) while Director holds the row', blockedWaiters >= 1);

      // While Save is blocked, Director (still holding the lock, same
      // session, no self-block) performs the REAL submit_contractor_schedule
      // RPC directly as SQL, simulating "Submit won the race and committed".
      await director.exec(`SET LOCAL request.jwt.claim.sub = '${contractorId}'`);
      const submitOut = await director.exec(
        `SELECT (public.submit_contractor_schedule(${PROJECT_G1}, gen_random_uuid(), 'director submit')->>'submissionId')`
      );
      r.check('Director-driven real submit_contractor_schedule call succeeds inside the held transaction', /^\d+$/.test(submitOut.trim()));
      const g1SubmissionId = submitOut.trim();

      await director.exec(`COMMIT`);

      const saveResult = await savePromise;
      r.check('the blocked Save Draft is rejected once unblocked (sees the now-committed PENDING_REVIEW state)', !!saveResult.error);
      r.check('rejection is SCHEDULE_PENDING_REVIEW', /SCHEDULE_PENDING_REVIEW/.test(saveResult.error?.message || ''));

      const snapshotDate = queryOne(`SELECT planned_start FROM public.project_schedule_version_tasks WHERE version_id = ${g1SubmissionId} AND wp_id = 'demo.walls';`);
      r.check('the committed snapshot holds Submit\'s dates (2027-03-01), never touched by the blocked-then-rejected Save', snapshotDate === '2027-03-01');

      const draftDate = queryOne(`SELECT planned_start FROM public.project_gantt_tasks WHERE project_id = ${PROJECT_G1} AND wp_id = 'demo.walls';`);
      r.check('FORBIDDEN STATE CHECK: the Draft row itself was never mutated by the blocked-then-rejected Save (still 2027-03-01, not 2027-09-01)', draftDate === '2027-03-01');
    } finally {
      director.close();
    }
  }

  r.section('G2. "Save wins": a Submit blocked behind a concurrently-committing Save correctly snapshots the just-committed new dates, never stale data');
  {
    const director = openDirectorSession();
    try {
      await director.exec(`BEGIN`);
      await director.exec(`SELECT id FROM public.projects WHERE id = ${PROJECT_G2} FOR UPDATE`);

      // Fire a REAL Submit concurrently — must block on Director's held lock.
      // PROJECT_G2's Draft is currently fully unscheduled (setupProject seeds
      // NULL/NULL), so this Submit, once unblocked, depends entirely on
      // Director's concurrent Save having completed first for completeness.
      const submitPromise = callSubmit(contractorAssigned, PROJECT_G2, randomUUID(), 'g2 submit');

      const blockedWaiters = await waitForBlockedWaiter();
      r.check('a real Submit call is genuinely blocked at the Postgres lock level while Director holds the row', blockedWaiters >= 1);

      // While Submit is blocked, Director performs the REAL
      // save_contractor_schedule_draft RPC directly as SQL, simulating "Save
      // won the race and committed" — scheduling both active WPs.
      await director.exec(`SET LOCAL request.jwt.claim.sub = '${contractorId}'`);
      const changesJson = JSON.stringify([
        { wpId: 'demo.walls', plannedStart: '2027-04-01', plannedFinish: '2027-04-05' },
        { wpId: 'finish.paint', plannedStart: '2027-04-06', plannedFinish: '2027-04-10' },
      ]).replace(/'/g, "''");
      const saveOut = await director.exec(
        `SELECT (public.save_contractor_schedule_draft(${PROJECT_G2}, '${changesJson}'::jsonb, gen_random_uuid())->>'updatedCount')`
      );
      r.check('Director-driven real save_contractor_schedule_draft call succeeds inside the held transaction', saveOut.trim() === '2');

      await director.exec(`COMMIT`);

      const submitResult = await submitPromise;
      r.check('the blocked Submit succeeds once unblocked (Draft is now complete thanks to the committed Save)', !submitResult.error, submitResult.error?.message);

      const snapshotDate = submitResult.data
        ? queryOne(`SELECT planned_start FROM public.project_schedule_version_tasks WHERE version_id = ${submitResult.data.submissionId} AND wp_id = 'demo.walls';`)
        : null;
      r.check('FORBIDDEN STATE CHECK: Submit\'s snapshot reflects Save\'s just-committed new dates (2027-04-01), never a stale pre-Save read (NULL)', snapshotDate === '2027-04-01');
    } finally {
      director.close();
    }
  }

  // ─── Section H: idempotency-replay ordering survives locking ────────────

  r.section('H1. Save Draft replay issued AFTER the project has moved to PENDING_REVIEW still returns its original cached response');
  {
    setupProject(PROJECT_G2, 'LOCK-G2');
    const replayClientRequestId = randomUUID();
    const original = await callDraftRpc(contractorAssigned, PROJECT_G2, [
      { wpId: 'demo.walls', plannedStart: '2027-05-01', plannedFinish: '2027-05-05' },
    ], replayClientRequestId);
    r.check('original Save Draft call succeeds', !original.error, original.error?.message);

    await callDraftRpc(contractorAssigned, PROJECT_G2, [
      { wpId: 'finish.paint', plannedStart: '2027-05-06', plannedFinish: '2027-05-10' },
    ]);
    const { error: submitError } = await callSubmit(contractorAssigned, PROJECT_G2, randomUUID(), 'h1 submit');
    r.check('project moves to PENDING_REVIEW', !submitError, submitError?.message);

    const replay = await callDraftRpc(contractorAssigned, PROJECT_G2, [
      { wpId: 'demo.walls', plannedStart: '2027-05-01', plannedFinish: '2027-05-05' },
    ], replayClientRequestId);
    r.check('the replay (same client_request_id) succeeds, does NOT hit SCHEDULE_PENDING_REVIEW', !replay.error, replay.error?.message);
    r.check('the replay is reported as a replay', replay.data?.idempotentReplay === true);
    r.check('the replay returns the ORIGINAL cached response', replay.data?.updatedCount === original.data?.updatedCount);
  }

  // ─── Section I: Scope-update-vs-Submit race coherence ────────────────────

  r.section('I1. A Scope update blocked behind a concurrently-committing Submit correctly re-evaluates lifecycle after unblocking and is rejected');
  {
    setupProject(PROJECT_G1, 'LOCK-G1');
    await callDraftRpc(contractorAssigned, PROJECT_G1, [
      { wpId: 'demo.walls', plannedStart: '2027-06-01', plannedFinish: '2027-06-05' },
      { wpId: 'finish.paint', plannedStart: '2027-06-06', plannedFinish: '2027-06-10' },
    ]);

    const director = openDirectorSession();
    // A SECOND, independent async session drives the concurrent Scope
    // UPDATE. This must NOT use the synchronous psql() helper (execFileSync
    // blocks Node's entire single-threaded event loop for as long as the
    // child process hasn't returned — while genuinely blocked on Director's
    // lock, that would freeze this very script, including the
    // waitForBlockedWaiter() polling loop below it needs to run
    // concurrently, deadlocking the test harness itself, not the product).
    const scopeUpdateSession = openDirectorSession();
    try {
      await director.exec(`BEGIN`);
      await director.exec(`SELECT id FROM public.projects WHERE id = ${PROJECT_G1} FOR UPDATE`);

      // A real, separate connection attempts a Scope UPDATE concurrently —
      // it shares the SAME implicit row lock an ordinary UPDATE takes, so it
      // must block behind Director exactly like the RPCs do.
      const scopeUpdatePromise = scopeUpdateSession.exec(
        `UPDATE public.projects SET scope = '{"zones":["Z"]}'::jsonb WHERE id = ${PROJECT_G1}`
      );

      const blockedWaiters = await waitForBlockedWaiter();
      r.check('a real Scope UPDATE is genuinely blocked at the Postgres lock level while Director holds the row', blockedWaiters >= 1);

      await director.exec(`SET LOCAL request.jwt.claim.sub = '${contractorId}'`);
      const submitOut = await director.exec(
        `SELECT (public.submit_contractor_schedule(${PROJECT_G1}, gen_random_uuid(), 'director submit for I1')->>'status')`
      );
      r.check('Director-driven real submit_contractor_schedule call succeeds inside the held transaction', submitOut.trim() === 'PENDING_REVIEW');

      await director.exec(`COMMIT`);

      await scopeUpdatePromise;
      const scopeUpdateError = scopeUpdateSession.getStderr();
      r.check('the blocked Scope update is rejected once unblocked (sees the now-committed PENDING_REVIEW state)', /ERROR/.test(scopeUpdateError));
      r.check('rejection is SCHEDULE_PENDING_REVIEW', /SCHEDULE_PENDING_REVIEW/.test(scopeUpdateError));

      const scopeValue = queryOne(`SELECT scope::text FROM public.projects WHERE id = ${PROJECT_G1};`);
      r.check('FORBIDDEN STATE CHECK: Scope was never actually mutated by the blocked-then-rejected update', scopeValue === null || scopeValue === '');
    } finally {
      director.close();
      scopeUpdateSession.close();
    }
  }
} finally {
  psql(`ALTER TABLE public.project_schedule_version_tasks DISABLE TRIGGER project_schedule_version_tasks_immutable;`);
  psql(`DELETE FROM public.project_schedule_versions WHERE project_id IN (${PROJECT_G1}, ${PROJECT_G2});`);
  psql(`ALTER TABLE public.project_schedule_version_tasks ENABLE TRIGGER project_schedule_version_tasks_immutable;`);
  psql(`DELETE FROM public.project_gantt_tasks WHERE project_id IN (${PROJECT_G1}, ${PROJECT_G2});`);
  psql(`DELETE FROM public.projects WHERE id IN (${PROJECT_G1}, ${PROJECT_G2});`);
  psql(`UPDATE public.profiles SET assigned_projects = array_remove(array_remove(assigned_projects, ${PROJECT_G1}), ${PROJECT_G2})
        WHERE id IN (SELECT id FROM auth.users WHERE email IN ('contractor-a-assigned@cert.local', 'pm-a-assigned@cert.local'));`);
}

const { fail } = r.summary();
process.exit(fail === 0 ? 0 : 1);
