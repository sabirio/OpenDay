import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const migration = readFileSync(new URL('../migrations/065_gantt_baseline_scope_snapshot.sql', import.meta.url), 'utf8');

console.log('\nganttBaselineScopeSnapshotMigration - Phase B.9');
check('submission header pins the Execution Scope revision',
  /ADD COLUMN IF NOT EXISTS execution_scope_version_id bigint/.test(migration)
  && /REFERENCES public\.project_execution_scope_versions\(id\)/.test(migration));
check('task snapshot stores stable Activity UUID and submitted title',
  /ADD COLUMN IF NOT EXISTS schedule_activity_id uuid/.test(migration)
  && /ADD COLUMN IF NOT EXISTS activity_title text/.test(migration)
  && /ADD COLUMN IF NOT EXISTS activity_phase_id text/.test(migration)
  && /ADD COLUMN IF NOT EXISTS activity_phase_label text/.test(migration));
check('Activity to Work Group membership has its own immutable snapshot',
  /CREATE TABLE IF NOT EXISTS public\.project_schedule_version_activity_work_groups/.test(migration)
  && /PRIMARY KEY \(version_id, schedule_activity_id, work_group_id\)/.test(migration)
  && /SCHEDULE_SCOPE_SNAPSHOT_IMMUTABLE/.test(migration));
check('snapshot Work Groups must belong to the pinned Execution Scope',
  /FOREIGN KEY \(execution_scope_version_id, ontology_version_id, work_group_id\)/.test(migration)
  && /REFERENCES public\.project_execution_scope_items/.test(migration));
check('submit resolves the latest Execution Scope under the project lock',
  /ORDER BY scope\.revision_number DESC/.test(migration)
  && /FOR UPDATE/.test(migration));
check('canonical submit rejects stale or incomplete Schedule Setup',
  /SCHEDULE_SETUP_STALE/.test(migration)
  && /SCHEDULE_SETUP_INCOMPLETE/.test(migration)
  && /INCOMPLETE_EXECUTION_SCOPE_COVERAGE/.test(migration));
check('canonical snapshot copies Activity identity, title, phase and dates atomically',
  /INSERT INTO public\.project_schedule_version_tasks[\s\S]+activity\.id,[\s\S]+activity\.title,[\s\S]+task\.phase_id,[\s\S]+task\.phase_label/.test(migration));
check('canonical snapshot copies Activity to Work Group mappings atomically',
  /INSERT INTO public\.project_schedule_version_activity_work_groups/.test(migration)
  && /mapping\.work_group_id/.test(migration));
check('legacy projects keep the prior wp_id snapshot path',
  /IF v_execution_scope_version_id IS NULL THEN[\s\S]+INSERT INTO public\.project_schedule_version_tasks/.test(migration));
check('response reports the pinned Execution Scope revision',
  /'executionScopeVersionId', v_execution_scope_version_id/.test(migration));
check('new snapshot table is RLS protected and read-only to authenticated clients',
  /ENABLE ROW LEVEL SECURITY/.test(migration)
  && /GRANT SELECT ON TABLE public\.project_schedule_version_activity_work_groups/.test(migration)
  && !/GRANT (INSERT|UPDATE|DELETE) ON TABLE/.test(migration));
check('SECURITY DEFINER submit exposure is explicitly restricted',
  /REVOKE ALL ON FUNCTION public\.submit_contractor_schedule\(bigint, uuid, text\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/.test(migration)
  && /GRANT EXECUTE ON FUNCTION public\.submit_contractor_schedule\(bigint, uuid, text\)[\s\S]+TO authenticated/.test(migration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
