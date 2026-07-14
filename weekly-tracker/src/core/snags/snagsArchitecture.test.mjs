import {
  isSnagModuleEnabled,
  SNAG_PROHIBITED_RUNTIME_MODULES,
  SNAG_REQUIRED_SHARED_CAPABILITIES,
  SnagDomainError,
  toSnagIntegrationEvent,
} from './index.js';

let pass = 0, fail = 0;
const check = (label, value) => value ? (pass++, console.log(`  OK ${label}`)) : (fail++, console.error(`  FAIL ${label}`));
const event = {
  id: 'event-1', eventType: 'SNAG_EVIDENCE_ADDED', occurredAt: '2026-07-14T00:00:00Z',
  actorId: 'actor-1', projectId: 'project-1', snagId: 'snag-1', sourceCommandId: 'request-1',
  newState: { evidenceId: 'evidence-1', storagePath: 'private/object.jpg', signedUrl: 'https://example.invalid/token' },
};

const envelope = toSnagIntegrationEvent(event, { companyId: 'company-1', projectId: 'project-1' });
check('integration envelope carries tenant, project, aggregate and correlation identity',
  envelope.companyId === 'company-1' && envelope.projectId === 'project-1' && envelope.aggregateType === 'SNAG' && envelope.correlationId === 'request-1');
check('integration envelope is explicitly versioned', envelope.schemaVersion === 1);
check('integration payload strips storage paths and temporary URLs',
  !JSON.stringify(envelope.payload).includes('private/object.jpg') && !JSON.stringify(envelope.payload).includes('example.invalid'));
check('integration envelope is immutable at its public boundary', Object.isFrozen(envelope) && Object.isFrozen(envelope.payload));

for (const [label, mutate, code] of [
  ['company scope is mandatory', () => toSnagIntegrationEvent(event, {}), 'INVALID_INTEGRATION_EVENT'],
  ['project mismatch fails closed', () => toSnagIntegrationEvent(event, { companyId: 'company-1', projectId: 'other' }), 'PROJECT_BOUNDARY'],
  ['invented events are rejected', () => toSnagIntegrationEvent({ ...event, eventType: 'SNAG_SCORED' }, { companyId: 'company-1' }), 'UNKNOWN_INTEGRATION_EVENT'],
]) {
  try { mutate(); check(label, false); } catch (error) { check(label, error instanceof SnagDomainError && error.code === code); }
}

check('standalone contract depends only on Shared Core capabilities',
  SNAG_REQUIRED_SHARED_CAPABILITIES.every(value => /^(identity|tenancy|projects|audit)\./.test(value)));
check('standalone contract explicitly excludes adjacent business modules', SNAG_PROHIBITED_RUNTIME_MODULES.length === 5);
check('entitlement seam accepts enabled module capability', isSnagModuleEnabled({ hasCapability: id => id === 'openday.snags' }));
check('entitlement seam fails closed when absent', !isSnagModuleEnabled(null));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
