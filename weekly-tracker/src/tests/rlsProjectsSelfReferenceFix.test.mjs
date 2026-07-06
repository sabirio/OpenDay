// rlsProjectsSelfReferenceFix.test.mjs - 022 contract: fixes projects_select
// self-referencing lookup that broke every INSERT ... RETURNING (42501).
// Run: node src/tests/rlsProjectsSelfReferenceFix.test.mjs

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const migration = readFileSync(new URL('../migrations/022_fix_projects_select_self_reference.sql', import.meta.url), 'utf8');

console.log('\nrlsProjectsSelfReferenceFix - 022 contract');

check('new function takes company_id as a direct parameter, not a table lookup',
  /CREATE OR REPLACE FUNCTION public\.can_view_own_project_row\(p_project_id bigint, p_company_id text\)/.test(migration));
check('new function does not re-query public.projects by id (the bug it fixes)',
  !/can_view_own_project_row[\s\S]*?FROM public\.projects\s+WHERE id = p_project_id/.test(migration));
check('new function is SECURITY DEFINER with search_path guard',
  /can_view_own_project_row[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/.test(migration));
check('preserves the explicit global-admin shortcut',
  /v_role = 'admin' AND v_profile_company IS NULL/.test(migration));
check('preserves admin/pm/viewer company-scoping logic',
  /IF v_role IN \('admin', 'pm', 'viewer'\) THEN\s*\n\s*RETURN p_company_id IS NULL OR v_profile_company = p_company_id;/.test(migration));
check('preserves contractor assigned_projects + company checks',
  /IF v_role = 'contractor' THEN[\s\S]*?p_project_id = ANY\(v_assigned_projects::bigint\[\]\)/.test(migration));

check('projects_select policy is repointed at the new function',
  /CREATE POLICY "projects_select"[\s\S]*?USING \(public\.can_view_own_project_row\(id, company_id\)\)/.test(migration));

check('does not touch can_access_project (still correct for every other policy)',
  !/CREATE OR REPLACE FUNCTION public\.can_access_project/.test(migration));

check('has a rollback note restoring the pre-022 policy', /Rollback:[\s\S]*USING \(public\.can_access_project\(id\)\)/.test(migration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
