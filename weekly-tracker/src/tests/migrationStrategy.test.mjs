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

console.log('\nmigrationStrategy - fresh install contract');

check('README documents 000_baseline as first fresh install step', /000_baseline\.sql[\s\S]*Canonical production schema baseline/.test(readme));
check('README documents 010 RLS after baseline', /010_rls_by_roles\.sql[\s\S]*Current role-based RLS policies/.test(readme));
check('README documents 011+ migrations after RLS', /011_ownership_uuid\.sql[\s\S]*018_submit_contractor_report_rpc\.sql[\s\S]*019_primary_key_defaults\.sql/.test(readme));
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
check('019 is idempotent for existing defaults', /IF v_default IS NULL THEN/.test(pkDefaults));
check('019 includes rollback notes', /Rollback, if needed/.test(pkDefaults) && /ALTER TABLE public\.projects\s+ALTER COLUMN id DROP DEFAULT/.test(pkDefaults));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
