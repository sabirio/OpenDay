import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/148_authenticated_security_definer_boundary.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/scheduleSubmissionService.js', import.meta.url), 'utf8');
let passed = 0;

function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('\nauthenticatedSecurityDefinerBoundary');

check('internal helpers are removed from every Data API role',
  /public\.next_snag_number\(bigint\)[\s\S]*public\.contractor_schedule_lifecycle_status\(bigint\)[\s\S]*public\.is_active_project_member\(bigint, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/.test(migration));
check('schedule read RPC requires an authenticated identity',
  /get_contractor_schedule_lifecycle_status[\s\S]*auth\.uid\(\) IS NULL[\s\S]*ERRCODE = '28000'/.test(migration));
check('schedule read RPC checks project-scoped access before reading status',
  /can_access_schedule_submissions\(p_project_id\) IS NOT TRUE[\s\S]*contractor_schedule_lifecycle_status\(p_project_id\)/.test(migration));
check('schedule read RPC has a pinned lookup path',
  /SET search_path = pg_catalog, public, pg_temp/.test(migration));
check('only authenticated receives the schedule read RPC',
  /REVOKE ALL ON FUNCTION public\.get_contractor_schedule_lifecycle_status\(bigint\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;[\s\S]*GRANT EXECUTE ON FUNCTION public\.get_contractor_schedule_lifecycle_status\(bigint\)[\s\S]*TO authenticated;/.test(migration));
check('frontend calls the authorization-checked schedule RPC',
  /rpc\('get_contractor_schedule_lifecycle_status'/.test(service)
    && !/rpc\('contractor_schedule_lifecycle_status'/.test(service));

console.log(`authenticatedSecurityDefinerBoundary: ${passed}/6 checks passed`);
