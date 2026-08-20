import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/152_plans_and_organization_entitlements.sql', import.meta.url), 'utf8');

for (const table of [
  'subscription_plans','plan_capabilities','organization_subscriptions','organization_entitlements',
]) assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}\\(`));

assert.match(migration, /INSERT INTO public\.subscription_plans[\s\S]*\('owner'[\s\S]*\('design'[\s\S]*\('contractor'[\s\S]*\('enterprise'/);
assert.match(migration, /organization_entitlements[\s\S]*source IN\([\s\S]*'plan'[\s\S]*'manual_override'[\s\S]*'trial'[\s\S]*'enterprise_contract'/);
assert.match(migration, /manual_override' THEN 400[\s\S]*enterprise_contract' THEN 300[\s\S]*trial' THEN 200[\s\S]*plan' THEN 100/);
assert.match(migration, /assert_plan_capability_dependencies/);
assert.match(migration, /PLAN_CAPABILITY_DEPENDENCY_MISSING/);
assert.match(migration, /organization_subscriptions_scoped_read[\s\S]*has_active_organization_membership/);
assert.match(migration, /organization_entitlements_scoped_read[\s\S]*has_active_organization_membership/);
assert.match(migration, /GRANT SELECT ON TABLE[\s\S]*organization_entitlements[\s\S]*TO authenticated/);
assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[\s\S]{0,300}organization_entitlements[\s\S]{0,100}authenticated/i);
assert.match(migration, /EXISTS\(SELECT 1 FROM public\.organization_subscriptions\)[\s\S]*EXISTS\(SELECT 1 FROM public\.organization_entitlements\)[\s\S]*EXISTING_ORGS_ASSIGNED_WITHOUT_DECISION/);
assert.doesNotMatch(migration, /email|domain/i);
console.log('plansAndEntitlements: all checks passed');
