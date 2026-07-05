// rlsMultiTenant.test.mjs - P1.5 multi-tenant hardening contract.
// Run: node src/tests/rlsMultiTenant.test.mjs

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const migration = readFileSync(new URL('../migrations/021_multi_tenant_hardening.sql', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

console.log('\nrlsMultiTenant - P1.5 contract');

check('is_global_admin is SECURITY DEFINER with search_path guard',
  /CREATE OR REPLACE FUNCTION public\.is_global_admin\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = public/.test(migration));
check('is_global_admin requires both admin role and NULL company_id',
  /lower\(role\) = 'admin' AND company_id IS NULL/.test(migration));

check('invite_contractor looks up caller company before authorizing',
  /SELECT lower\(role\), company_id[\s\S]*INTO caller_role, caller_company/.test(migration));
check('invite_contractor refuses a cross-company profile role change',
  /IF FOUND AND NOT \([\s\S]*caller_role = 'admin' AND caller_company IS NULL[\s\S]*OR target_company IS NULL[\s\S]*OR caller_company = target_company[\s\S]*RETURN jsonb_build_object\('error', 'Not authorized for this company'\)/.test(migration));
check('invite_contractor still requires admin/pm role',
  /caller_role NOT IN \('admin', 'pm'\)/.test(migration));
check('invite_contractor still upserts pending_invites and updates profiles.role',
  /INSERT INTO public\.pending_invites/.test(migration) && /UPDATE public\.profiles p\s*\n\s*SET role = 'Contractor'/.test(migration));

check('templates_insert now requires is_global_admin, not any admin',
  /CREATE POLICY "templates_insert"[\s\S]*WITH CHECK \( public\.is_global_admin\(\) \)/.test(migration));
check('templates_update now requires is_global_admin, not any admin',
  /CREATE POLICY "templates_update"[\s\S]*USING\s+\( public\.is_global_admin\(\) \)[\s\S]*WITH CHECK \( public\.is_global_admin\(\) \)/.test(migration));
check('templates_delete now requires is_global_admin, not any admin',
  /CREATE POLICY "templates_delete"[\s\S]*USING \( public\.is_global_admin\(\) \)/.test(migration));

check('021 has a rollback note', /Rollback:[\s\S]*DROP FUNCTION IF EXISTS public\.is_global_admin\(\)/.test(migration));
check('README documents 021 in the fresh-install path', /021_multi_tenant_hardening\.sql/.test(readme));
check('README security notes explain the invite_contractor cross-company gap', /Company A PM could demote a Company B Admin/.test(readme));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
