import assert from 'node:assert/strict';
import { resolveEffectiveEntitlements } from './effectiveEntitlementResolver.js';

const subscription = {
  organizationId: 'org-a',planId: 'design',status: 'ACTIVE',startsAt: '2026-01-01',endsAt: null,
};
const planCapabilities = [
  { planId: 'design',capabilityId: 'core.projects',enabled: true,defaultConfig: { max: 25 } },
  { planId: 'design',capabilityId: 'commercial.cost',enabled: true,defaultConfig: { currency: 'KZT' } },
  { planId: 'design',capabilityId: 'commercial.margin',enabled: true,defaultConfig: {} },
];
const dependencies = [
  { capabilityId: 'commercial.cost',requiredCapabilityId: 'core.projects' },
  { capabilityId: 'commercial.margin',requiredCapabilityId: 'commercial.cost' },
];
const at = new Date('2026-08-19T00:00:00Z');

let result = resolveEffectiveEntitlements({ subscription,planCapabilities,dependencies,at });
assert.equal(result.subscriptionActive, true);
assert.equal(result.capabilities.every((row) => row.enabled), true);

result = resolveEffectiveEntitlements({
  subscription,planCapabilities,dependencies,at,
  organizationEntitlements: [{
    organizationId: 'org-a',capabilityId: 'commercial.cost',source: 'manual_override',
    enabled: false,config: {},startsAt: '2026-08-01',expiresAt: null,
  }],
});
assert.equal(result.capabilities.find((row) => row.capabilityId === 'commercial.cost').disabledReason, 'EXPLICITLY_DISABLED');
assert.equal(result.capabilities.find((row) => row.capabilityId === 'commercial.margin').disabledReason, 'DEPENDENCY_NOT_ENTITLED');

result = resolveEffectiveEntitlements({
  subscription,planCapabilities,dependencies,at,
  organizationEntitlements: [
    { organizationId: 'org-a',capabilityId: 'core.projects',source: 'trial',enabled: false,config: {},startsAt: '2026-01-01',expiresAt: '2026-08-18' },
    { organizationId: 'org-a',capabilityId: 'commercial.cost',source: 'manual_override',enabled: true,config: { threshold: 5 },startsAt: '2026-08-01' },
    { organizationId: 'org-a',capabilityId: 'commercial.cost',source: 'enterprise_contract',enabled: false,config: {},startsAt: '2026-08-01' },
  ],
});
assert.equal(result.capabilities.find((row) => row.capabilityId === 'core.projects').enabled, true);
assert.deepEqual(result.capabilities.find((row) => row.capabilityId === 'commercial.cost').config, { currency: 'KZT',threshold: 5 });
assert.equal(result.capabilities.find((row) => row.capabilityId === 'commercial.cost').enabled, true);

result = resolveEffectiveEntitlements({
  subscription: { ...subscription,endsAt: '2026-09-01' },planCapabilities,dependencies,at,
  organizationEntitlements: [{
    organizationId: 'org-a',capabilityId: 'commercial.cost',source: 'manual_override',
    enabled: true,config: {},startsAt: '2026-08-01',expiresAt: '2026-10-01',
  }],
});
assert.equal(result.capabilities.find((row) => row.capabilityId === 'commercial.cost').expiresAt, '2026-09-01');

assert.deepEqual(resolveEffectiveEntitlements({
  subscription: { ...subscription,status: 'SUSPENDED' },planCapabilities,dependencies,at,
}), { subscriptionActive: false,capabilities: [] });
console.log('effectiveEntitlementResolver: all checks passed');
