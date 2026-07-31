// Contractor Schedule Workspace — LOCAL-ONLY deterministic E2E dataset
// (Simplification Phase 3C).
//
// Reuses the existing local-target guard (env.mjs -> localTargetGuard.mjs)
// and the base fixtures.mjs users (contractor-a-assigned@cert.local,
// contractor-a-unassigned@cert.local, contractor-b@cert.local,
// pm-a-assigned@cert.local) — no new users are created; this script only
// APPENDS its own fixture project ids to contractor-a-assigned's existing
// assigned_projects array (additive, never removes the 900001 assignment
// other cert scripts depend on).
//
// Two deterministic projects exercise the full CONTRACTOR_MANAGED /
// AUTO_GENERATED mode-gating surface:
//   960001 SCHEDULE-CM  Schedule Test Mall     — CONTRACTOR_MANAGED, mixed scope
//   960002 SCHEDULE-AG  Schedule Comparison Mall — AUTO_GENERATED (default),
//                       used only to prove the Schedule action/route stay
//                       unavailable for a non-contractor-managed project.
//
// 960001's project_gantt_tasks are seeded directly (materializeUnscheduledScheduleFromScope's
// own DB shape — no CPM, no automatic dates) with a deliberate mix:
//   demo.walls      — unscheduled (null/null/null): exercises "no bar" UX.
//   mep.electrical  — already scheduled: exercises move/resize.
//   finish.paint    — unscheduled: a second unscheduled row.
//   legacy.archived — archived: must stay invisible/out of scope.
//
// Idempotent: re-running clears and rebuilds only these two projects'
// project_gantt_tasks rows and resets their schedule_ownership_mode.
//
// Run: node scripts/certification/contractorScheduleFixtures.mjs
// (after: npm run cert:reset:contractor-schedule)

import { execFileSync } from 'node:child_process';

let SUPABASE_URL, ANON_KEY, DB_URL;
try {
  ({ SUPABASE_URL, ANON_KEY, DB_URL } = await import('./env.mjs'));
} catch (err) {
  console.error('BLOCKED: local Supabase target could not be proven.');
  console.error(`  ${err.message}`);
  process.exit(1);
}

try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
  if (!res.ok && res.status !== 404) throw new Error(`unexpected status ${res.status}`);
} catch (err) {
  console.error(`\nSKIPPED — ENVIRONMENT UNAVAILABLE: local Supabase stack is not reachable at ${SUPABASE_URL}.`);
  console.error('Run: npx supabase start (from weekly-tracker/), then npm run cert:reset:contractor-schedule first.');
  console.error(`(${err.message})\n`);
  process.exit(3);
}

// Fixed, non-colliding ID range — separate from fixtures.mjs's 900001-900003/
// 900201-900202/900401/900601, seed-test-data.sql's 910001, and
// contractorWorkspaceFixtures.mjs's 950001-950006.
const PROJECT = {
  CONTRACTOR_MANAGED: 960001, // SCHEDULE-CM Schedule Test Mall
  AUTO_GENERATED: 960002,     // SCHEDULE-AG Schedule Comparison Mall
};

const CONTRACTOR_ASSIGNED_EMAIL = 'contractor-a-assigned@cert.local';
const PM_ASSIGNED_EMAIL = 'pm-a-assigned@cert.local';

function psql(sql) {
  return execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
  }).trim();
}

function assertScheduleOwnershipModeExists() {
  const exists = psql(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'schedule_ownership_mode');"
  );
  if (exists !== 't') {
    throw new Error(
      'FAIL: Contractor Schedule fixture requires migrations 046-047 applied. ' +
      'Run "npm run cert:reset:contractor-schedule" first, then re-run this fixture.'
    );
  }
}

function main() {
  console.log('Contractor Schedule Workspace local fixtures — target:', SUPABASE_URL, '(local only, guarded by env.mjs)');

  assertScheduleOwnershipModeExists();

  const contractorId = psql(`SELECT id FROM auth.users WHERE email = '${CONTRACTOR_ASSIGNED_EMAIL}';`);
  if (!contractorId) {
    throw new Error(`Expected existing fixture user ${CONTRACTOR_ASSIGNED_EMAIL} not found — run "npm run cert:reset:contractor-schedule" first.`);
  }
  console.log(`  reusing existing fixture Contractor ${CONTRACTOR_ASSIGNED_EMAIL} -> ${contractorId}`);

  const pmId = psql(`SELECT id FROM auth.users WHERE email = '${PM_ASSIGNED_EMAIL}';`);
  if (!pmId) {
    throw new Error(`Expected existing fixture user ${PM_ASSIGNED_EMAIL} not found — run "npm run cert:reset:contractor-schedule" first.`);
  }
  console.log(`  reusing existing fixture PM ${PM_ASSIGNED_EMAIL} -> ${pmId}`);

  psql(`
    INSERT INTO public.projects (id, store_code, shopping_mall_name, company_id, project_status,
      construction_start_date, construction_end_date, target_opening_date, schedule_ownership_mode)
    VALUES
      (${PROJECT.CONTRACTOR_MANAGED}, 'SCHEDULE-CM', 'Schedule Test Mall',       'company-a', 'Active',
        CURRENT_DATE - 10, CURRENT_DATE + 90, CURRENT_DATE + 110, 'CONTRACTOR_MANAGED'),
      (${PROJECT.AUTO_GENERATED},     'SCHEDULE-AG', 'Schedule Comparison Mall', 'company-a', 'Active',
        CURRENT_DATE - 10, CURRENT_DATE + 90, CURRENT_DATE + 110, 'AUTO_GENERATED')
    ON CONFLICT (id) DO UPDATE SET
      store_code = EXCLUDED.store_code, shopping_mall_name = EXCLUDED.shopping_mall_name,
      company_id = EXCLUDED.company_id, project_status = EXCLUDED.project_status,
      construction_start_date = EXCLUDED.construction_start_date,
      construction_end_date = EXCLUDED.construction_end_date,
      target_opening_date = EXCLUDED.target_opening_date,
      schedule_ownership_mode = EXCLUDED.schedule_ownership_mode;
    SELECT setval('public.projects_id_seq', 960100, false);
  `);
  console.log('  SCHEDULE-CM (CONTRACTOR_MANAGED) and SCHEDULE-AG (AUTO_GENERATED) projects upserted');

  // Additive: append 960001/960002 to the existing fixture contractor's
  // assigned_projects if not already present. Never removes 900001 (the
  // base fixtures.mjs assignment certifyContractorScheduleDraft.mjs and
  // others depend on).
  psql(`
    UPDATE public.profiles
    SET assigned_projects = (
      SELECT array_agg(DISTINCT x) FROM unnest(
        COALESCE(assigned_projects, '{}'::integer[]) || ARRAY[${PROJECT.CONTRACTOR_MANAGED}, ${PROJECT.AUTO_GENERATED}]::integer[]
      ) AS x
    )
    WHERE id = '${contractorId}';
  `);
  console.log(`  ${CONTRACTOR_ASSIGNED_EMAIL} assigned_projects extended with 960001/960002 (additive)`);

  // PM also gets 960001 added to assigned_projects (Simplification Phase
  // 3C.1 E2E test 17): proves PM sees the project card via /contractor-select
  // but never the Schedule action button, not merely that PM lacks
  // assigned_projects membership (a different, already-covered case).
  psql(`
    UPDATE public.profiles
    SET assigned_projects = (
      SELECT array_agg(DISTINCT x) FROM unnest(
        COALESCE(assigned_projects, '{}'::integer[]) || ARRAY[${PROJECT.CONTRACTOR_MANAGED}]::integer[]
      ) AS x
    )
    WHERE id = '${pmId}';
  `);
  console.log(`  ${PM_ASSIGNED_EMAIL} assigned_projects extended with 960001 (additive)`);

  psql(`DELETE FROM public.project_gantt_tasks WHERE project_id IN (${PROJECT.CONTRACTOR_MANAGED}, ${PROJECT.AUTO_GENERATED});`);
  psql(`
    INSERT INTO public.project_gantt_tasks (project_id, wp_id, wp_label, phase_id, phase_label, is_archived, planned_start, planned_end, duration_days)
    VALUES
      (${PROJECT.CONTRACTOR_MANAGED}, 'demo.walls',      'Demo Walls',      'demolition', 'Demolition', false, NULL, NULL, NULL),
      (${PROJECT.CONTRACTOR_MANAGED}, 'finish.paint',     'Finish Paint',    'finishes',   'Finishes',   false, NULL, NULL, NULL),
      (${PROJECT.CONTRACTOR_MANAGED}, 'mep.electrical',   'MEP Electrical',  'mep',        'MEP',        false,
        CURRENT_DATE + 5, CURRENT_DATE + 10, 5),
      (${PROJECT.CONTRACTOR_MANAGED}, 'legacy.archived',  'Legacy Archived', 'demolition', 'Demolition', true,  NULL, NULL, NULL);
  `);
  console.log('  SCHEDULE-CM scope seeded: 2 unscheduled (demo.walls, finish.paint) + 1 scheduled (mep.electrical, 5-day) + 1 archived (legacy.archived)');

  console.log('\nContractor Schedule Workspace fixtures ready.');
  console.log(`  Assigned Contractor:  ${CONTRACTOR_ASSIGNED_EMAIL}`);
  console.log(`  CONTRACTOR_MANAGED:   960001 (SCHEDULE-CM)`);
  console.log(`  AUTO_GENERATED:       960002 (SCHEDULE-AG)`);
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error('CONTRACTOR SCHEDULE FIXTURE SETUP FAILED:', err.message || err);
  process.exit(1);
}
