// migrationStrategy.test.mjs - P0.3 canonical migration path contract.
// Run: node src/tests/migrationStrategy.test.mjs

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const readme = read('../../README.md');
const baseline = read('../migrations/000_baseline.sql');
const rls = read('../migrations/010_rls_by_roles.sql');
const pkDefaults = read('../migrations/019_primary_key_defaults.sql');
const contractorValidation = read('../migrations/027_contractor_report_wp_validation.sql');

console.log('\nmigrationStrategy - fresh install contract');

check('README documents 000_baseline as first fresh install step', /000_baseline\.sql[\s\S]*Canonical production schema baseline/.test(readme));
check('README documents 010 RLS after baseline', /010_rls_by_roles\.sql[\s\S]*Current role-based RLS policies/.test(readme));
check('README documents 011+ migrations after RLS', /011_ownership_uuid\.sql[\s\S]*018_submit_contractor_report_rpc\.sql[\s\S]*019_primary_key_defaults\.sql[\s\S]*020_rls_company_role_hardening\.sql/.test(readme));
check('README marks historical 001-009 as not for fresh installs', /Do not run historical migrations `001-009` on a fresh database/i.test(readme));
check('baseline header points fresh installs to 010 then 011+', /Fresh install: run this file, then 010_rls_by_roles\.sql, then 011\+/.test(baseline));

check('010 installs get_my_role helper', /CREATE OR REPLACE FUNCTION public\.get_my_role\(\)/.test(rls));
check('010 enables RLS on projects', /ALTER TABLE public\.projects\s+ENABLE ROW LEVEL SECURITY/.test(rls));
check('010 enables RLS on contractor_reports', /ALTER TABLE public\.contractor_reports\s+ENABLE ROW LEVEL SECURITY/.test(rls));
check('010 enables RLS on site_visits', /ALTER TABLE public\.site_visits\s+ENABLE ROW LEVEL SECURITY/.test(rls));
check('010 blocks anon by using authenticated policies', /FOR SELECT TO authenticated/.test(rls) && !/TO anon/.test(rls));

for (const table of ['projects', 'reports', 'site_visits', 'progress_history']) {
  check(`019 creates sequence-backed default for ${table}.id`, new RegExp(`'${table}'[\\s\\S]*${table}_id_seq`).test(pkDefaults));
}
check('019 is idempotent for existing defaults', /IF v_default IS NULL AND COALESCE\(v_is_identity, 'NO'\) <> 'YES' THEN/.test(pkDefaults));
check('019 guards against identity-column false positive (0A000)', /is_identity/.test(pkDefaults) && /cannot change ownership of identity sequence/.test(pkDefaults));
check('019 includes rollback notes', /Rollback, if needed/.test(pkDefaults) && /ALTER TABLE public\.projects\s+ALTER COLUMN id DROP DEFAULT/.test(pkDefaults));

check('027 replaces only the Contractor atomic boundary append-only', /CREATE OR REPLACE FUNCTION public\.submit_contractor_report_atomic/.test(contractorValidation) && !/submit_site_visit_atomic/.test(contractorValidation));
check('027 rejects duplicate structured WP identities', /DUPLICATE_WORK_PACKAGE/.test(contractorValidation) && /GROUP BY item\."wpId"/.test(contractorValidation));
check('027 requires an active WP in the requested project', /WORK_PACKAGE_OUT_OF_SCOPE/.test(contractorValidation) && /task\.project_id = p_project_id/.test(contractorValidation) && /NOT COALESCE\(task\.is_archived, false\)/.test(contractorValidation));
check('027 validation precedes request-ledger insert', contractorValidation.indexOf('DUPLICATE_WORK_PACKAGE') < contractorValidation.indexOf('INSERT INTO public.write_command_requests'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
