import assert from 'node:assert/strict';
import { resolveCapabilityClosure, validateCapabilityGraph } from './capabilityGraph.js';

const capabilities = [
  { id: 'core.projects' },
  { id: 'estimating.delivery' },
  { id: 'pricing.commercial' },
  { id: 'proposals.issue' },
];
const dependencies = [
  { capabilityId: 'estimating.delivery', requiredCapabilityId: 'core.projects' },
  { capabilityId: 'pricing.commercial', requiredCapabilityId: 'estimating.delivery' },
  { capabilityId: 'proposals.issue', requiredCapabilityId: 'pricing.commercial' },
];

assert.deepEqual(validateCapabilityGraph({ capabilities, dependencies }), { ok: true, issues: [] });
assert.deepEqual(
  resolveCapabilityClosure(['proposals.issue'], { capabilities, dependencies }),
  {
    ok: true,
    capabilityIds: ['core.projects', 'estimating.delivery', 'pricing.commercial', 'proposals.issue'],
    issues: [],
  },
);

assert.equal(validateCapabilityGraph({
  capabilities,
  dependencies: [...dependencies, { capabilityId: 'core.projects', requiredCapabilityId: 'proposals.issue' }],
}).issues.some((issue) => issue.code === 'DEPENDENCY_CYCLE'), true);

assert.equal(validateCapabilityGraph({
  capabilities,
  dependencies: [{ capabilityId: 'proposals.issue', requiredCapabilityId: 'missing.capability' }],
}).issues.some((issue) => issue.code === 'UNKNOWN_REQUIRED_CAPABILITY'), true);

assert.equal(resolveCapabilityClosure(['missing.capability'], { capabilities, dependencies }).ok, false);
console.log('capabilityGraph: all checks passed');
