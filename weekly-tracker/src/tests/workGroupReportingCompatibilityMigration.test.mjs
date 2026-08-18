import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const migration = readFileSync(new URL('../migrations/062_work_group_reporting_compatibility.sql', import.meta.url), 'utf8');

console.log('\nworkGroupReportingCompatibilityMigration - nullable historical bridge');
check('adds nullable version pins to report and progress facts',
  ['contractor_reports', 'contractor_report_wps', 'site_visit_wps', 'progress_history']
    .every(table => new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]{0,180}ADD COLUMN IF NOT EXISTS work_ontology_version_id uuid`).test(migration)));
check('adds canonical Work Group ids to contractor and PM progress lines',
  ['contractor_report_wps', 'site_visit_wps']
    .every(table => new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]{0,220}ADD COLUMN IF NOT EXISTS work_group_id uuid`).test(migration)));
check('does not backfill or rewrite historical fact rows',
  !/UPDATE\s+public\.(contractor_reports|contractor_report_wps|site_visit_wps|progress_history)/i.test(migration));
check('uses composite version and Work Group foreign keys',
  /FOREIGN KEY \(work_ontology_version_id, work_group_id\)/.test(migration)
  && /contractor_report_wps_work_group_fkey/.test(migration)
  && /site_visit_wps_work_group_fkey/.test(migration));
check('maps known execution ids through explicit classifications',
  /work_ontology_execution_classifications/.test(migration)
  && /classification\.execution_work_package_id = NEW\.wp_id/.test(migration)
  && /classification_kind = 'MAPPED'/.test(migration));
check('supports explicit custom execution mapping only inside project ontology',
  /classification_kind IS NULL AND NEW\.work_group_id IS NOT NULL/.test(migration)
  && /work_group\.ontology_version_id = project_version_id/.test(migration));
check('creates normalized report risk to Work Group references',
  /CREATE TABLE IF NOT EXISTS public\.contractor_report_risk_work_groups/.test(migration)
  && /PRIMARY KEY \(report_id, work_group_id\)/.test(migration));
check('risk links use RLS and project access authorization',
  /ENABLE ROW LEVEL SECURITY/.test(migration)
  && /public\.can_access_project\(report\.project_id\)/.test(migration)
  && /FOR SELECT TO authenticated/.test(migration));
check('risk links are explicit authenticated read-only API data',
  /REVOKE ALL ON TABLE public\.contractor_report_risk_work_groups FROM PUBLIC, anon, authenticated, service_role/.test(migration)
  && /GRANT SELECT ON TABLE public\.contractor_report_risk_work_groups TO authenticated/.test(migration));
check('trigger functions are unavailable as RPC endpoints',
  (migration.match(/REVOKE ALL ON FUNCTION public\.[a-z_]+\(\) FROM PUBLIC, anon, authenticated, service_role;/g) || []).length === 3);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
