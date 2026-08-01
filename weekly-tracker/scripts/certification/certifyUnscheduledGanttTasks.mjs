// certifyUnscheduledGanttTasks.mjs — Simplification Phase 2 DB-level proof.
//
// Proves, against a REAL local project_gantt_tasks row (not a mock), that
// the table already accepts planned_start = planned_end = duration_days =
// NULL with no schema change — this is the ground-truth DB half of the
// "Scope exists before Schedule" foundation; the JS-level materializer
// behavior is covered separately by
// src/core/gantt/materializeUnscheduledScheduleFromScope.test.mjs.
//
// Local-only: requireCertificationEnvironment() + env.mjs's assertLocalTarget
// (imported transitively via lib.mjs) refuse anything but a loopback target.
// Inserts exactly one throwaway row scoped to a private test wp_id, verifies
// it via direct psql (ground truth, bypassing RLS), then deletes it — never
// touches the canonical fixture rows other certification scripts depend on.
//
// Run: node scripts/certification/certifyUnscheduledGanttTasks.mjs
// (after resetAndDeploy.mjs / cert:reset:master-catalog + fixtures.mjs)

import { loadFixtureState, psql, queryOne, makeReporter, requireCertificationEnvironment } from './lib.mjs';

await requireCertificationEnvironment();

const state = loadFixtureState();
const PROJECT_A = state.projects.PROJECT_A;
const TEST_WP_ID = `cert.unscheduled.${Date.now()}`;

const r = makeReporter('Unscheduled Gantt task DB acceptance (Simplification Phase 2)');

async function cleanup() {
  psql(`DELETE FROM public.project_gantt_tasks WHERE project_id = ${PROJECT_A} AND wp_id = '${TEST_WP_ID}';`);
}

try {
  r.section('1. Insert a row with planned_start/planned_end/duration_days all NULL');
  // Ground-truth path (direct psql as the postgres superuser), same as the
  // rest of this repo's certification scripts use for schema-level proofs —
  // this is a DB-schema fact (does the column accept NULL), not an
  // RLS/application-authorization fact, so it is deliberately not routed
  // through the anon/service Supabase client or any RPC.
  let insertError = null;
  try {
    psql(
      `INSERT INTO public.project_gantt_tasks
         (project_id, wp_id, wp_label, phase_id, phase_label, planned_start, planned_end, duration_days, status, is_archived)
       VALUES (${PROJECT_A}, '${TEST_WP_ID}', 'Certification: unscheduled WP', 'cert_phase', 'Certification Phase', NULL, NULL, NULL, 'not_started', false);`
    );
  } catch (err) {
    insertError = err;
  }
  r.check('insert with all three schedule fields NULL succeeds (no CHECK/NOT NULL constraint blocks it)', !insertError, insertError?.message);

  r.section('2. Ground-truth verification via direct psql');
  const row = queryOne(
    `SELECT planned_start IS NULL, planned_end IS NULL, duration_days IS NULL, status, is_archived
     FROM public.project_gantt_tasks WHERE project_id = ${PROJECT_A} AND wp_id = '${TEST_WP_ID}';`
  );
  const [plannedStartNull, plannedEndNull, durationNull, status, isArchived] = (row ?? '').split('|');
  r.check('row exists after insert', row !== null);
  r.check('planned_start persisted as NULL', plannedStartNull === 't');
  r.check('planned_end persisted as NULL', plannedEndNull === 't');
  r.check('duration_days persisted as NULL', durationNull === 't');
  r.check('status defaults to not_started (schedule state, not execution state, stays separate)', status === 'not_started');
  r.check('is_archived is false (row is visible/active, just unscheduled)', isArchived === 'f');

  r.section('3. Idempotent upsert (ON CONFLICT project_id,wp_id) on the same NULL row does not error');
  let upsertError = null;
  try {
    psql(
      `INSERT INTO public.project_gantt_tasks (project_id, wp_id, wp_label, planned_start, planned_end, duration_days)
       VALUES (${PROJECT_A}, '${TEST_WP_ID}', 'Certification: unscheduled WP', NULL, NULL, NULL)
       ON CONFLICT (project_id, wp_id) DO UPDATE SET wp_label = EXCLUDED.wp_label, planned_start = EXCLUDED.planned_start, planned_end = EXCLUDED.planned_end, duration_days = EXCLUDED.duration_days;`
    );
  } catch (err) {
    upsertError = err;
  }
  r.check('re-upserting the same unscheduled row succeeds', !upsertError, upsertError?.message);
} finally {
  await cleanup();
  const remaining = queryOne(`SELECT COUNT(*) FROM public.project_gantt_tasks WHERE project_id = ${PROJECT_A} AND wp_id = '${TEST_WP_ID}';`);
  r.check('cleanup: throwaway test row removed, fixture state untouched', remaining === '0');
}

const { fail } = r.summary();
process.exit(fail === 0 ? 0 : 1);
