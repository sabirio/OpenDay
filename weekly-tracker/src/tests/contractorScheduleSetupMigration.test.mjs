import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}
const migration = readFileSync(new URL('../migrations/064_contractor_schedule_setup.sql', import.meta.url), 'utf8');

console.log('\ncontractorScheduleSetupMigration - Phase B.8');
check('stores contractor-owned activities separately from Work Groups',
  /CREATE TABLE IF NOT EXISTS public\.project_schedule_activities/.test(migration)
  && /CREATE TABLE IF NOT EXISTS public\.project_schedule_activity_work_groups/.test(migration));
check('supports many-to-many Activity to Work Group mapping',
  /PRIMARY KEY \(activity_id, work_group_id\)/.test(migration)
  && /FOREIGN KEY \(execution_scope_version_id, ontology_version_id, work_group_id\)/.test(migration));
check('pins activity mappings to the current Execution Scope revision',
  /STALE_EXECUTION_SCOPE/.test(migration)
  && /ORDER BY scope\.revision_number DESC/.test(migration));
check('requires full Execution Scope coverage without forbidding Work Group splits',
  /INCOMPLETE_EXECUTION_SCOPE_COVERAGE/.test(migration)
  && !/GROUP BY work_group\.value\s+HAVING count\(\*\) > 1/.test(migration));
check('setup is Contractor-only and Draft-only',
  /v_role IS DISTINCT FROM 'contractor'/.test(migration)
  && /assigned_projects/.test(migration)
  && /v_lifecycle_status <> 'DRAFT'/.test(migration));
check('uses one idempotent atomic RPC',
  /schedule\.save_setup/.test(migration)
  && /p_client_request_id uuid/.test(migration)
  && /idempotentReplay/.test(migration));
check('reuses activity UUIDs as stable Gantt identities and preserves unchanged dates',
  /'activity:' \|\| \(item->>'activityId'\)/.test(migration)
  && /ON CONFLICT \(project_id, wp_id\) DO UPDATE SET/.test(migration)
  && !/planned_start = EXCLUDED/.test(migration));
check('legacy projects cannot enter this path and are not backfilled',
  /STALE_EXECUTION_SCOPE/.test(migration)
  && !/INSERT INTO public\.project_schedule_activities[\s\S]+FROM public\.projects/i.test(migration));
check('tables use RLS and explicit authenticated read-only grants',
  (migration.match(/ENABLE ROW LEVEL SECURITY/g) || []).length === 2
  && (migration.match(/GRANT SELECT ON TABLE public\.project_schedule_/g) || []).length === 2
  && !/GRANT (INSERT|UPDATE|DELETE) ON TABLE/.test(migration));
check('RPC exposure is explicit and anonymous execution is revoked',
  /REVOKE ALL ON FUNCTION public\.save_contractor_schedule_setup\([^)]+\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/.test(migration)
  && /GRANT EXECUTE ON FUNCTION public\.save_contractor_schedule_setup\([^)]+\)[\s\S]+TO authenticated/.test(migration));
check('direct Data API writes cannot relink Gantt rows to activities',
  /SCHEDULE_ACTIVITY_LINK_REQUIRES_ATOMIC_COMMAND/.test(migration)
  && /BEFORE INSERT OR UPDATE OF schedule_activity_id/.test(migration)
  && /REVOKE ALL ON FUNCTION private\.prevent_direct_schedule_activity_link_change\(\)/.test(migration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
