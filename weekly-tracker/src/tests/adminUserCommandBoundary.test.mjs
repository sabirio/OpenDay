import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const sql = read('../migrations/138_admin_user_command_boundary.sql');
const page = read('../pages/AdminUsers.jsx');
const hook = read('../hooks/useAdminUsers.js');
const service = read('../services/adminUserService.js');
const directorySql = read('../migrations/142_user_directory_roles_and_removal.sql');
const legacyRetirementSql = read('../migrations/143_retire_legacy_admin_user_update.sql');

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; console.error(`  FAIL ${label}`); }
}

check('Admin Users page has no direct Supabase persistence',
  !/lib\/supabase|\.from\(|\.rpc\(/.test(page));
check('Admin user reads and writes pass through orchestration',
  /useAdminUsers/.test(page) && /loadAdminUsers|saveAdminUser/.test(hook));
check('Admin user service uses dedicated database commands',
  /list_organization_users/.test(service) && /update_organization_user/.test(service)
    && /deactivate_organization_user/.test(service) && /send-organization-invitation/.test(service));
check('Role and assignment changes are immutable audited commands',
  /admin_user_change_events/.test(sql)
  && /ADMIN_USER_CHANGE_EVENT_IMMUTABLE/.test(sql)
  && /admin_user_command_requests/.test(sql));
check('Authenticated clients cannot directly update role or assignments',
  /REVOKE UPDATE ON public\.profiles FROM authenticated/.test(sql)
  && /GRANT UPDATE\(name\) ON public\.profiles TO authenticated/.test(sql));
check('Internal assignments remain owned by Project Team',
  /Project responsibilities remain on each project's Team page/.test(page)
    && !/assignedProjects|toggleProject/.test(page));
check('Job role is separate from authorization role',
  /job_role/.test(directorySql) && /p_job_role/.test(directorySql) && /p_access_role/.test(directorySql));
check('Remove is audited and non-destructive',
  /change_type[\s\S]*REMOVED/.test(directorySql) && /role='Inactive'/.test(directorySql)
    && !/DELETE FROM auth\.users|DELETE FROM public\.profiles/.test(directorySql));
check('Legacy mixed-role update command is no longer browser-callable',
  /REVOKE ALL ON FUNCTION public\.update_admin_user\(uuid,text,text,integer\[\],uuid\)/.test(legacyRetirementSql)
    && /authenticated/.test(legacyRetirementSql));

console.log(`\nAdmin User Command Boundary: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
