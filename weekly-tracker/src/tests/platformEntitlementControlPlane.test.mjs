import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/154_platform_entitlement_control_plane.sql', import.meta.url), 'utf8');

for (const table of ['platform_entitlement_change_events','platform_entitlement_command_requests']) {
  assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}\\(`));
}
for (const fn of [
  'list_platform_organizations','get_platform_organization',
  'set_platform_organization_status','set_platform_organization_subscription',
  'set_platform_organization_entitlement',
]) assert.match(migration, new RegExp(`public\\.${fn}`));
assert.match(migration, /private\.require_platform_superadmin/);
assert.match(migration, /PLATFORM_ADMIN_FORBIDDEN/);
assert.match(migration, /PLATFORM_COMMAND_IDEMPOTENCY_CONFLICT/);
assert.match(migration, /SUBSCRIPTION_REVISION_CONFLICT/);
assert.match(migration, /ENTITLEMENT_REVISION_CONFLICT/);
assert.match(migration, /platform_entitlement_change_events_immutable/);
assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*platform_entitlement_command_requests[\s\S]*authenticated/);
assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[\s\S]{0,300}(?:organization_subscriptions|organization_entitlements)[\s\S]{0,100}authenticated/i);
assert.doesNotMatch(migration, /profiles\.(?:role|job_role)|email\s*(?:=|LIKE|ILIKE)/i);
console.log('platformEntitlementControlPlane: all checks passed');
