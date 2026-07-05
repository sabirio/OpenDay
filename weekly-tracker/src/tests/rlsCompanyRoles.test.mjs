// rlsCompanyRoles.test.mjs - P0.4 RLS/company role hardening contract.
// Run: node src/tests/rlsCompanyRoles.test.mjs

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const migration = readFileSync(new URL('../migrations/020_rls_company_role_hardening.sql', import.meta.url), 'utf8');
const rpc = readFileSync(new URL('../migrations/018_submit_contractor_report_rpc.sql', import.meta.url), 'utf8');

console.log('\nrlsCompanyRoles - P0.4 contract');

check('defines explicit global admin as admin with NULL company_id', /v_role = 'admin' AND v_profile_company IS NULL/.test(migration));
check('normalizes role casing through lower(role)', /SELECT lower\(role\)/.test(migration));
check('uses bigint cast for assigned_projects vs project ids', /ANY\(v_assigned_projects::bigint\[\]\)/.test(migration));
check('projects select is routed through can_access_project', /CREATE POLICY "projects_select"[\s\S]*USING \(public\.can_access_project\(id\)\)/.test(migration));
check('PM/Admin project writes are routed through can_write_project', /CREATE POLICY "gantt_tasks_update"[\s\S]*USING \(public\.can_write_project\(project_id\)\)/.test(migration));
check('contractor direct report insert no longer has contractor branch', /CREATE POLICY "contractor_reports_insert"[\s\S]*WITH CHECK \(public\.can_write_project\(project_id\)\)/.test(migration));
check('contractor direct report wp insert no longer has contractor branch', /CREATE POLICY "contractor_report_wps_insert"[\s\S]*WITH CHECK \(public\.can_write_project\(project_id\)\)/.test(migration));
check('progress_history direct insert no longer has contractor branch', /CREATE POLICY "progress_history_insert"[\s\S]*WITH CHECK \(public\.can_write_project\(project_id\)\)/.test(migration));
check('audit log reads are project scoped', /CREATE POLICY "audit_log_select"[\s\S]*can_access_audit_log\(table_name, record_id\)/.test(migration));
check('site photo reads are project scoped', /CREATE POLICY "authenticated can read site photos"[\s\S]*can_access_project/.test(migration));
check('invite_contractor is SECURITY DEFINER with search_path and role guard', /CREATE OR REPLACE FUNCTION public\.invite_contractor[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = public[\s\S]*caller_role NOT IN \('Admin', 'PM'\)/.test(migration));
check('submit_contractor_report keeps its internal auth guard', /v_uid uuid := auth\.uid\(\)/.test(rpc) && /IF v_uid IS NULL/.test(rpc));
check('submit_contractor_report keeps company guard', /v_profile_company <> v_project_company/.test(rpc));
check('020 has rollback notes', /Rollback:[\s\S]*Re-run src\/migrations\/010_rls_by_roles\.sql/.test(migration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
