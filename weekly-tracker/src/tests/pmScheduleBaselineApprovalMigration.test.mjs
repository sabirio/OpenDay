import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};
const migration = readFileSync(new URL('../migrations/066_pm_schedule_baseline_approval.sql', import.meta.url), 'utf8');

console.log('\npmScheduleBaselineApprovalMigration - Phase B.10');
check('creates an explicit official baseline registry', /CREATE TABLE IF NOT EXISTS public\.project_schedule_baselines/.test(migration));
check('baseline is tied to the same project and submitted version', /FOREIGN KEY \(schedule_version_id, project_id\)/.test(migration));
check('canonical baseline is tied to the submitted Scope pin', /FOREIGN KEY \(schedule_version_id, execution_scope_version_id\)/.test(migration));
check('preserves existing approvals without overwriting them', /INSERT INTO public\.project_schedule_baselines[\s\S]+FROM public\.project_schedule_versions version[\s\S]+ON CONFLICT \(schedule_version_id\) DO NOTHING/.test(migration));
check('official baseline rows are append-only', /SCHEDULE_BASELINE_IMMUTABLE/.test(migration) && /BEFORE UPDATE OR DELETE/.test(migration));
check('approval remains PM-only and project-scoped', /v_role IS DISTINCT FROM 'pm'/.test(migration) && /can_write_project\(v_version\.project_id\)/.test(migration));
check('approval validates frozen Activity identity, title and phase', /BASELINE_ACTIVITY_SNAPSHOT_INCOMPLETE/.test(migration) && /activity_phase_label/.test(migration));
check('approval validates every Activity has Work Groups', /BASELINE_WORK_GROUP_SNAPSHOT_INCOMPLETE/.test(migration));
check('approval validates complete pinned Scope coverage', /BASELINE_SCOPE_COVERAGE_INCOMPLETE/.test(migration));
check('version approval and official baseline insert are one atomic command', /UPDATE public\.project_schedule_versions[\s\S]+INSERT INTO public\.project_schedule_baselines/.test(migration));
check('baseline table has project-authorized RLS and read-only client access', /ENABLE ROW LEVEL SECURITY/.test(migration) && /can_access_schedule_submissions\(project_id\)/.test(migration) && /GRANT SELECT ON TABLE/.test(migration) && !/GRANT (INSERT|UPDATE|DELETE) ON TABLE/.test(migration));
check('privileged approval RPC is explicitly restricted', /REVOKE ALL ON FUNCTION public\.approve_schedule_submission\(bigint, text, uuid\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/.test(migration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
