import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/146_security_definer_execute_hardening.sql', import.meta.url), 'utf8');
let passed = 0;

function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('\nsecurityDefinerExecuteHardening');

check('revokes legacy helper execution from every client role',
  /REVOKE ALL ON FUNCTION public\.auth_user_role\(\)[\s\S]*FROM PUBLIC,anon,authenticated,service_role/.test(migration));
check('retains helper execution only for authenticated users',
  /GRANT EXECUTE ON FUNCTION public\.auth_user_role\(\)[\s\S]*TO authenticated/.test(migration));
check('includes the contractor invitation command in the restricted list',
  /public\.invite_contractor\(text\)/.test(migration));
check('removes all client execution from the RLS event trigger',
  /REVOKE ALL ON FUNCTION public\.rls_auto_enable\(\)[\s\S]*FROM PUBLIC,anon,authenticated,service_role/.test(migration));
check('does not grant the RLS event trigger back to a client role',
  !/GRANT EXECUTE ON FUNCTION public\.rls_auto_enable/.test(migration));

console.log(`securityDefinerExecuteHardening: ${passed}/5 checks passed`);
