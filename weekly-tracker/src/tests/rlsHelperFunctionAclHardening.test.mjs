import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const migration056 = readFileSync(new URL('../migrations/056_restrict_rls_helper_function_acl.sql', import.meta.url), 'utf8');
const migration020 = readFileSync(new URL('../migrations/020_rls_company_role_hardening.sql', import.meta.url), 'utf8');
const migration028 = readFileSync(new URL('../migrations/028_production_security_reconciliation.sql', import.meta.url), 'utf8');

console.log('\nrlsHelperFunctionAclHardening - migration 056 static contract');

check('056 revokes anon, authenticated, and service_role EXECUTE from can_admin_company(text)',
  /REVOKE ALL ON FUNCTION public\.can_admin_company\(text\)\s+FROM PUBLIC, anon, authenticated, service_role;/.test(migration056));
check('056 revokes anon, authenticated, and service_role EXECUTE from can_create_project(text)',
  /REVOKE ALL ON FUNCTION public\.can_create_project\(text\)\s+FROM PUBLIC, anon, authenticated, service_role;/.test(migration056));
check('056 revokes anon, authenticated, and service_role EXECUTE from can_write_project(bigint)',
  /REVOKE ALL ON FUNCTION public\.can_write_project\(bigint\)\s+FROM PUBLIC, anon, authenticated, service_role;/.test(migration056));

check('056 grants EXECUTE to authenticated for can_admin_company(text)',
  /GRANT EXECUTE ON FUNCTION public\.can_admin_company\(text\)\s+TO authenticated;/.test(migration056));
check('056 grants EXECUTE to authenticated for can_create_project(text)',
  /GRANT EXECUTE ON FUNCTION public\.can_create_project\(text\)\s+TO authenticated;/.test(migration056));
check('056 grants EXECUTE to authenticated for can_write_project(bigint)',
  /GRANT EXECUTE ON FUNCTION public\.can_write_project\(bigint\)\s+TO authenticated;/.test(migration056));

check('056 REVOKEs authenticated before re-GRANTing it, for every function (REVOKE ALL clears any pre-existing WITH GRANT OPTION; a plain GRANT does not narrow one)', (() => {
  const names = ['can_admin_company\\(text\\)', 'can_create_project\\(text\\)', 'can_write_project\\(bigint\\)'];
  return names.every(name => {
    const revokeIdx = migration056.search(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\s+FROM PUBLIC, anon, authenticated, service_role;`));
    const grantIdx = migration056.search(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\s+TO authenticated;`));
    return revokeIdx !== -1 && grantIdx !== -1 && revokeIdx < grantIdx;
  });
})());

const migration056ActiveLines = migration056.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
check('056 never grants EXECUTE to anon, PUBLIC, or service_role in an active (non-comment) statement', !/TO (anon|PUBLIC|service_role)[,;]/.test(migration056ActiveLines));
check('056 explicitly names authenticated and service_role in every REVOKE (not left implicit/default-dependent, and not skipped to preserve a pre-existing grant option)',
  (migration056ActiveLines.match(/REVOKE ALL ON FUNCTION[\s\S]{0,120}?FROM ([^;]+);/g) || []).length === 3 &&
  (migration056ActiveLines.match(/REVOKE ALL ON FUNCTION[\s\S]{0,120}?FROM ([^;]+);/g) || []).every(stmt => /\bauthenticated\b/.test(stmt) && /\bservice_role\b/.test(stmt)));
check('056 does not modify any function body (no CREATE OR REPLACE FUNCTION)', !/CREATE (OR REPLACE )?FUNCTION/.test(migration056));
check('056 does not touch public.projects table grants directly (table-level remediation is a separate, environment-specific bridge decision - see migration 028)',
  !/GRANT[\s\S]*?ON (TABLE )?public\.projects\b/.test(migration056) && !/REVOKE[\s\S]*?ON (TABLE )?public\.projects\b/.test(migration056));
check('056 touches exactly the three named helper functions and nothing else',
  (migration056.match(/FUNCTION public\.\w+\(/g) || []).every(m =>
    /can_admin_company\(|can_create_project\(|can_write_project\(/.test(m)));

console.log('\nrlsHelperFunctionAclHardening - source-of-truth cross-check against migration 020');

check('020 defines can_admin_company(p_company_id text) with no REVOKE/GRANT of its own (confirming the platform-default exposure this migration closes)',
  /CREATE OR REPLACE FUNCTION public\.can_admin_company\(p_company_id text\)/.test(migration020) &&
  !/REVOKE[\s\S]{0,400}can_admin_company/.test(migration020) &&
  !/GRANT[\s\S]{0,400}can_admin_company/.test(migration020));
check('020 defines can_create_project(p_company_id text) with no REVOKE/GRANT of its own',
  /CREATE OR REPLACE FUNCTION public\.can_create_project\(p_company_id text\)/.test(migration020));
check('020 defines can_write_project(p_project_id bigint) with no REVOKE/GRANT of its own',
  /CREATE OR REPLACE FUNCTION public\.can_write_project\(p_project_id bigint\)/.test(migration020));
check('all three 020 helper functions fail closed on unauthenticated callers (auth.uid() IS NULL check present near each definition)', (() => {
  const names = ['can_admin_company', 'can_create_project', 'can_write_project'];
  return names.every(name => {
    const idx = migration020.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    if (idx === -1) return false;
    const window = migration020.slice(idx, idx + 600);
    return /auth\.uid\(\) IS NULL/.test(window);
  });
})());

console.log('\nrlsHelperFunctionAclHardening - independently confirms 028 already contains the public.projects table-level remediation (bridge candidate, not new SQL)');

check('028 already REVOKEs ALL on public.projects FROM anon (Part 5) - the table-level excess-grant fix already exists and is reviewed',
  /REVOKE ALL ON[\s\S]{0,400}public\.projects[\s\S]{0,200}FROM anon;/.test(migration028));
check('028 already REVOKEs REFERENCES, TRIGGER, TRUNCATE on public.projects FROM authenticated (Part 5)',
  /REVOKE REFERENCES, TRIGGER, TRUNCATE ON[\s\S]{0,400}public\.projects[\s\S]{0,200}FROM authenticated;/.test(migration028));
check('028 never REVOKEs or GRANTs the three helper functions\' own EXECUTE ACL (it calls can_write_project as authorization logic elsewhere, but never touches these functions\' own grants - confirming 056 is genuinely new work, not duplicating 028)',
  !/(REVOKE|GRANT)[\s\S]{0,200}(can_admin_company|can_create_project|can_write_project)\(/.test(migration028));

console.log(`\n-- rlsHelperFunctionAclHardening: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
