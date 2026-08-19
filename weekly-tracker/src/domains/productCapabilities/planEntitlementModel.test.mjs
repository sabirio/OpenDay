import assert from 'node:assert/strict';
import {
  ENTITLEMENT_SOURCE_PRIORITY,
  validateEntitlementRecord,
  validatePlanCapabilitySelection,
} from './planEntitlementModel.js';

const graph = {
  capabilities: [{ id: 'core.projects' }, { id: 'commercial.cost' }, { id: 'commercial.margin' }],
  dependencies: [
    { capabilityId: 'commercial.cost', requiredCapabilityId: 'core.projects' },
    { capabilityId: 'commercial.margin', requiredCapabilityId: 'commercial.cost' },
  ],
};

assert.equal(validatePlanCapabilitySelection([
  'core.projects','commercial.cost','commercial.margin',
], graph).ok, true);
assert.deepEqual(validatePlanCapabilitySelection(['commercial.margin'], graph).issues, [
  { code: 'PLAN_DEPENDENCY_MISSING', capabilityId: 'commercial.cost' },
  { code: 'PLAN_DEPENDENCY_MISSING', capabilityId: 'core.projects' },
]);
assert.equal(ENTITLEMENT_SOURCE_PRIORITY.manual_override > ENTITLEMENT_SOURCE_PRIORITY.plan, true);

const now = new Date('2026-08-19T00:00:00Z');
assert.equal(validateEntitlementRecord({
  organizationId: 'org-a',capabilityId: 'commercial.margin',source: 'trial',
  enabled: true,config: {},startsAt: '2026-08-01T00:00:00Z',expiresAt: '2026-09-01T00:00:00Z',
}, now).isCurrentlyValid, true);
assert.equal(validateEntitlementRecord({
  organizationId: 'org-a',capabilityId: 'commercial.margin',source: 'trial',
  enabled: true,config: {},startsAt: '2026-08-01T00:00:00Z',expiresAt: '2026-08-18T00:00:00Z',
}, now).isCurrentlyValid, false);
assert.equal(validateEntitlementRecord({
  organizationId: 'org-a',capabilityId: 'commercial.margin',source: 'email_domain',
  enabled: true,config: {},
}, now).ok, false);
console.log('planEntitlementModel: all checks passed');
