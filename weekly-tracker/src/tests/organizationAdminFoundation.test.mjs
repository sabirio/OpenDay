import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/155_organization_admin_foundation.sql', import.meta.url), 'utf8');

for (const table of [
  'organization_user_invitations','organization_user_change_events',
  'organization_user_command_requests',
]) assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}\\(`));
for (const fn of [
  'list_organization_users','prepare_organization_user_invitation',
  'mark_organization_user_invitation_sent','activate_my_organization_invitations',
  'update_organization_user','deactivate_organization_user',
  'get_project_team_foundation',
]) assert.match(migration, new RegExp(`public\\.${fn}`));
assert.match(migration, /private\.require_organization_admin/);
assert.match(migration, /ORGANIZATION_ADMIN_FORBIDDEN/);
assert.match(migration, /ORGANIZATION_COMMAND_IDEMPOTENCY_CONFLICT/);
assert.match(migration, /ORGANIZATION_USER_REVISION_CONFLICT/);
assert.match(migration, /ORGANIZATION_ADMIN_CANNOT_DEACTIVATE_SELF/);
assert.match(migration, /ORGANIZATION_REQUIRES_ACTIVE_ADMIN/);
assert.match(migration, /organization_user_events_immutable/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.mark_organization_user_invitation_sent\(uuid\) TO service_role/);
assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[\s\S]{0,300}organization_(?:memberships|user_invitations)[\s\S]{0,100}authenticated/i);
assert.doesNotMatch(migration, /private\.is_platform_superadmin\([^)]*\)[\s\S]{0,100}(?:prepare_organization|update_organization|deactivate_organization)/i);
console.log('organizationAdminFoundation: all checks passed');
