import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/153_effective_entitlement_resolver.sql', import.meta.url), 'utf8');

assert.match(migration, /private\.resolve_effective_organization_entitlements/);
assert.match(migration, /public\.get_effective_organization_entitlements/);
assert.match(migration, /public\.has_organization_capability/);
assert.match(migration, /public\.require_organization_capability/);
assert.match(migration, /source_priority DESC,\s*candidate\.record_priority DESC/);
assert.match(migration, /entitlement\.starts_at<=p_at[\s\S]*entitlement\.expires_at>p_at/);
assert.match(migration, /WITH RECURSIVE[\s\S]*disabled\(capability_id\)/);
assert.match(migration, /DEPENDENCY_NOT_ENTITLED/);
assert.match(migration, /FEATURE_NOT_ENTITLED/);
assert.match(migration, /has_active_organization_membership/);
assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*private\.resolve_effective_organization_entitlements[\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*public\.get_effective_organization_entitlements[\s\S]*TO authenticated/);
assert.doesNotMatch(migration, /email|domain|job_role/i);
console.log('effectiveEntitlementResolver: all checks passed');
